# Added in sprint 47 — reporting pipeline.

import csv
from datetime import datetime


def process(data, mode=1):
    r = []
    for x in data:
        if mode == 1:
            v = x[2] * 1.08
            if x[4] > 90:
                v = v * 0.95
            r.append([x[0], x[1], v, x[3]])
        elif mode == 2:
            if x[4] <= 30:
                continue
            v = x[2] * 1.08 * 1.15
            r.append([x[0], x[1], v, x[3]])
        else:
            r.append(x)

    # also write a file
    fn = f"out_{int(datetime.now().timestamp())}.csv"
    with open(fn, "w") as f:
        w = csv.writer(f)
        for row in r:
            w.writerow(row)

    return r


def run(src):
    with open(src) as f:
        rows = list(csv.reader(f))[1:]
        parsed = [[r[0], r[1], float(r[2]), r[3], int(r[4])] for r in rows]
    return process(parsed, mode=1)
