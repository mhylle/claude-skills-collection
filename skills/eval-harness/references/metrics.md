# Metrics — pass@k and pass^k

Two metrics cover most use cases: **pass@k** for "can it ever solve this?" and **pass^k** for "can it always solve this?" Use the decision guide at the bottom to pick between them.

---

## pass@k

**Definition:** The probability that at least one of k samples passes the evaluation.

**Formula:**
```
pass@k = 1 - C(n-c, k) / C(n, k)

Where:
- n = total number of samples
- c = number of correct samples
- k = number of samples considered
- C(a,b) = binomial coefficient "a choose b"
```

**Unbiased estimator:**

```python
import numpy as np
from math import comb

def pass_at_k(n: int, c: int, k: int) -> float:
    """
    Calculate pass@k metric.

    Args:
        n: Total number of samples generated
        c: Number of samples that passed
        k: Number of samples to consider

    Returns:
        Probability of at least one pass in k samples
    """
    if n - c < k:
        return 1.0
    return 1.0 - comb(n - c, k) / comb(n, k)

# Example usage
n_samples = 10
n_correct = 3

print(f"pass@1: {pass_at_k(10, 3, 1):.3f}")  # 0.300
print(f"pass@5: {pass_at_k(10, 3, 5):.3f}")  # 0.738
print(f"pass@10: {pass_at_k(10, 3, 10):.3f}") # 1.000
```

**Interpretation:**
- pass@1 = 0.30 → 30% chance of getting it right on first try
- pass@5 = 0.74 → 74% chance of at least one correct in 5 attempts
- Higher k → higher pass rate (more chances to succeed)

**When to use:**
- Code generation tasks where any working solution is acceptable
- Creative tasks with multiple valid outputs
- When retry/regeneration is cheap and acceptable
- Measuring "can it ever get this right?"

---

## pass^k (pass-hat-k)

**Definition:** The probability that all k samples pass the evaluation. Measures consistency and reliability.

**Formula:**
```
pass^k = (c/n)^k

Where:
- n = total number of samples
- c = number of correct samples
- k = number of samples required to all pass
```

**Implementation:**

```python
def pass_hat_k(n: int, c: int, k: int) -> float:
    """
    Calculate pass^k metric (all k samples must pass).

    Args:
        n: Total number of samples generated
        c: Number of samples that passed
        k: Number of samples that must all pass

    Returns:
        Probability of all k samples passing
    """
    if n == 0:
        return 0.0
    pass_rate = c / n
    return pass_rate ** k

# Example usage
n_samples = 10
n_correct = 8

print(f"pass^1: {pass_hat_k(10, 8, 1):.3f}")  # 0.800
print(f"pass^3: {pass_hat_k(10, 8, 3):.3f}")  # 0.512
print(f"pass^5: {pass_hat_k(10, 8, 5):.3f}")  # 0.328
```

**Interpretation:**
- pass^1 = 0.80 → 80% of individual attempts pass
- pass^3 = 0.51 → 51% chance of 3 consecutive passes
- Higher k → lower pass rate (harder to be consistently correct)

**When to use:**
- Safety-critical applications where consistency matters
- Production deployments requiring reliability
- When failures are costly (can't just retry)
- Measuring "can it reliably get this right?"

---

## Comparison and decision guide

| Metric | Formula | Use case | Question answered |
|---|---|---|---|
| pass@1 | P(at least 1 in 1) | Single-shot capability | "Can it solve this?" |
| pass@k | P(at least 1 in k) | Best-of-k capability | "Can it ever solve this?" |
| pass^k | P(all k pass) | Consistency/reliability | "Can it always solve this?" |

**Picking the right metric:**

```
Are failures acceptable?
├── Yes, can retry → Use pass@k
│   └── How many retries allowed? → Set k accordingly
└── No, must be reliable → Use pass^k
    └── How many consecutive successes needed? → Set k accordingly
```
