import csv
import io
import json
import urllib.request


class ReportBuilder:
    """Builds the weekly sales report. Fetches, transforms, renders, exports, emails."""

    def __init__(self, api_base, token, db_conn, smtp):
        self.api_base = api_base
        self.token = token
        self.db = db_conn
        self.smtp = smtp
        self.rows = []
        self.totals = {}
        self.rendered = ""

    def fetch_remote(self, region):
        url = self.api_base + "/sales?region=" + region
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + self.token})
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read().decode())
        out = []
        for d in data["results"]:
            # status codes: 0 ok, 1 refunded, 2 chargeback, 3 pending
            if d["status"] == 0 or d["status"] == 3:
                out.append(d)
        self.rows = out
        return out

    def fetch_local(self):
        cur = self.db.cursor()
        cur.execute("select sku, name, amount, region, ts from sales where exported = 0")
        for sku, name, amount, region, ts in cur.fetchall():
            self.rows.append({"sku": sku, "name": name, "amount": amount, "region": region, "ts": ts})

    def transform(self):
        for row in self.rows:
            amt = row["amount"]
            # apply currency normalization
            if row["region"] == "US":
                amt = amt * 6.9
            elif row["region"] == "UK":
                amt = amt * 8.7
            elif row["region"] == "DE" or row["region"] == "FR" or row["region"] == "ES":
                amt = amt * 7.4
            row["amount_dkk"] = round(amt, 2)

    def compute_totals(self):
        for row in self.rows:
            region = row["region"]
            if region not in self.totals:
                self.totals[region] = 0
            self.totals[region] += row["amount_dkk"]

    def render_html(self):
        html = "<table>"
        html += "<tr><th>SKU</th><th>Name</th><th>Region</th><th>DKK</th></tr>"
        for row in self.rows:
            html += "<tr>"
            html += "<td>" + str(row["sku"]) + "</td>"
            html += "<td>" + str(row["name"]) + "</td>"
            html += "<td>" + str(row["region"]) + "</td>"
            html += "<td>" + str(row["amount_dkk"]) + "</td>"
            html += "</tr>"
        html += "</table>"
        html += "<h3>Totals</h3><ul>"
        for region, total in self.totals.items():
            html += "<li>" + region + ": " + str(total) + "</li>"
        html += "</ul>"
        self.rendered = html
        return html

    def render_csv(self):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["sku", "name", "region", "amount_dkk"])
        for row in self.rows:
            w.writerow([row["sku"], row["name"], row["region"], row["amount_dkk"]])
        return buf.getvalue()

    def export_db(self):
        cur = self.db.cursor()
        for row in self.rows:
            cur.execute("update sales set exported = 1 where sku = %s and ts = %s", (row["sku"], row["ts"]))
        self.db.commit()

    def email_report(self, to_addr):
        self.smtp.sendmail("reports@corp.example", to_addr, self.rendered)

    def run_weekly(self, region, to_addr):
        self.fetch_remote(region)
        self.fetch_local()
        self.transform()
        self.compute_totals()
        self.render_html()
        self.export_db()
        self.email_report(to_addr)
