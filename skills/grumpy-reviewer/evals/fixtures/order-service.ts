// Handles incoming order requests end to end.
import { db } from "../db";
import { mailer } from "../mail";

const TAX = 0.25;
const SHIP_FLAT = 49;
const SHIP_FREE_OVER = 500;

export class OrderService {
  async handleRequest(req: any, res: any) {
    // ---- request parsing + validation ----
    const body = req.body;
    if (!body) {
      res.status(400).json({ error: "no body" });
      return;
    }
    if (!body.customerId || typeof body.customerId !== "string") {
      res.status(400).json({ error: "bad customer" });
      return;
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ error: "no items" });
      return;
    }
    for (const it of body.items) {
      if (!it.sku || typeof it.qty !== "number" || it.qty <= 0) {
        res.status(400).json({ error: "bad item" });
        return;
      }
    }
    const customerId = body.customerId;
    const items = body.items;
    const coupon = body.coupon || null;
    const country = body.country || "DK";
    const currency = body.currency || "DKK";
    const expedited = !!body.expedited;

    // ---- look up products ----
    const products: any[] = [];
    for (const it of items) {
      const p = await db.query("SELECT * FROM products WHERE sku = $1", [it.sku]);
      if (!p.rows.length) {
        res.status(404).json({ error: "unknown sku " + it.sku });
        return;
      }
      products.push({ ...p.rows[0], qty: it.qty });
    }

    // ---- pricing rules ----
    let subtotal = 0;
    for (const p of products) {
      let line = p.price * p.qty;
      // tiered volume discount
      if (p.qty >= 100) {
        line = line * 0.8;
      } else if (p.qty >= 50) {
        line = line * 0.85;
      } else if (p.qty >= 20) {
        line = line * 0.9;
      } else if (p.qty >= 10) {
        line = line * 0.95;
      }
      subtotal += line;
    }
    let discount = 0;
    if (coupon) {
      const c = await db.query("SELECT * FROM coupons WHERE code = $1", [coupon]);
      if (c.rows.length) {
        const cc = c.rows[0];
        if (cc.type === "percent") {
          discount = subtotal * (cc.value / 100);
        } else if (cc.type === "flat") {
          discount = cc.value;
        } else if (cc.type === "shipping") {
          discount = 0; // handled later
        }
      }
    }
    let shipping = subtotal >= SHIP_FREE_OVER ? 0 : SHIP_FLAT;
    if (expedited) shipping += 99;
    if (country !== "DK") shipping += 150;
    const taxed = (subtotal - discount) * TAX;
    const total = subtotal - discount + shipping + taxed;

    // ---- persistence ----
    const order = await db.query(
      "INSERT INTO orders(customer_id, subtotal, discount, shipping, tax, total, currency, status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [customerId, subtotal, discount, shipping, taxed, total, currency, "confirmed"]
    );
    const orderId = order.rows[0].id;
    for (const p of products) {
      await db.query(
        "INSERT INTO order_lines(order_id, sku, qty, price) VALUES($1,$2,$3,$4)",
        [orderId, p.sku, p.qty, p.price]
      );
      await db.query("UPDATE products SET stock = stock - $1 WHERE sku = $2", [p.qty, p.sku]);
    }

    // ---- notification ----
    const cust = await db.query("SELECT * FROM customers WHERE id = $1", [customerId]);
    if (cust.rows.length && cust.rows[0].email) {
      await mailer.send(
        cust.rows[0].email,
        "Order " + orderId + " confirmed",
        "Thanks for your order. Total: " + total + " " + currency
      );
    }

    res.status(201).json({ orderId, total, currency });
  }

  // 8 positional parameters
  buildLineItem(
    sku: string,
    name: string,
    qty: number,
    unitPrice: number,
    discountPct: number,
    taxRate: number,
    warehouse: string,
    giftWrap: boolean
  ) {
    const gross = qty * unitPrice;
    const net = gross * (1 - discountPct);
    const tax = net * taxRate;
    return { sku, name, qty, net, tax, warehouse, giftWrap, total: net + tax };
  }

  // status routing
  nextStatus(current: string) {
    switch (current) {
      case "draft": return "pending";
      case "pending": return "confirmed";
      case "confirmed": return "packed";
      case "packed": return "shipped";
      case "shipped": return "delivered";
      case "delivered": return "closed";
      case "cancelled": return "cancelled";
      case "refunded": return "closed";
      case "returned": return "refunded";
      default: return "unknown";
    }
  }
}
