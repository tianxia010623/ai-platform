"""Standalone demo of the Thompson Sampling prompt-variant selector.

Real user feedback volume is far too small right now to show the bandit
converging on live traffic, so this script simulates many independent runs
against a set of prompt variants with known (but hidden-from-the-algorithm)
true win rates, averages the results, and renders an HTML report showing:

  1. Cumulative regret: Thompson Sampling vs. two baselines (pure random
     selection, and epsilon-greedy) — how much reward is left on the table
     by not always picking the best variant. Averaged over many trials so
     the curves show the algorithm's real behavior rather than one run's
     luck.
  2. Selection share over time: which variant Thompson Sampling picks,
     round by round, averaged the same way, showing it learn to favor the
     best one.

This does not touch the app's real database — it's a pure simulation. Run
it with:

    cd backend && python scripts/simulate_bandit.py

Output: backend/scripts/bandit_simulation.html (open it in a browser).
"""

import json
import random
from pathlib import Path

ROUNDS = 400
TRIALS = 300  # independent repeats, averaged, so curves show the algorithm's
              # actual behavior instead of one run's luck
SEED = 7

# Hidden "true" win rate per variant — the algorithm never sees these
# directly, only the simulated thumbs up/down they generate.
VARIANTS = [
    {"name": "Baseline (original)", "true_rate": 0.52},
    {"name": "Warmer tone", "true_rate": 0.61},
    {"name": "More Socratic questions", "true_rate": 0.70},
    {"name": "Shorter replies", "true_rate": 0.47},
]

EPSILON = 0.1  # for the epsilon-greedy baseline


def thompson_pick(alphas, betas, rng):
    samples = [rng.betavariate(a, b) for a, b in zip(alphas, betas)]
    return max(range(len(samples)), key=lambda i: samples[i])


def epsilon_greedy_pick(alphas, betas, rng):
    if rng.random() < EPSILON:
        return rng.randrange(len(alphas))
    means = [a / (a + b) for a, b in zip(alphas, betas)]
    return max(range(len(means)), key=lambda i: means[i])


def random_pick(alphas, betas, rng):
    return rng.randrange(len(alphas))


def run_one_trial(pick_fn, rng, track_selection_share=False):
    n = len(VARIANTS)
    alphas = [1.0] * n
    betas = [1.0] * n
    true_rates = [v["true_rate"] for v in VARIANTS]
    best_rate = max(true_rates)

    cumulative_regret = [0.0] * ROUNDS
    selection_share = [[0.0] * ROUNDS for _ in range(n)] if track_selection_share else None
    selection_counts = [0] * n

    regret_so_far = 0.0
    for t in range(ROUNDS):
        choice = pick_fn(alphas, betas, rng)
        reward = 1 if rng.random() < true_rates[choice] else 0
        if reward == 1:
            alphas[choice] += 1
        else:
            betas[choice] += 1

        regret_so_far += best_rate - true_rates[choice]
        cumulative_regret[t] = regret_so_far

        if track_selection_share:
            selection_counts[choice] += 1
            for i in range(n):
                selection_share[i][t] = selection_counts[i] / (t + 1)

    final_estimated_rates = [a / (a + b) for a, b in zip(alphas, betas)]
    return cumulative_regret, selection_share, alphas, betas, final_estimated_rates


def average_over_trials(pick_fn, base_seed, track_selection_share=False):
    n = len(VARIANTS)
    regret_sum = [0.0] * ROUNDS
    share_sum = [[0.0] * ROUNDS for _ in range(n)] if track_selection_share else None
    alpha_sum = [0.0] * n
    beta_sum = [0.0] * n
    rate_sum = [0.0] * n

    for trial in range(TRIALS):
        rng = random.Random(base_seed + trial)
        regret, share, alphas, betas, rates = run_one_trial(pick_fn, rng, track_selection_share)
        for t in range(ROUNDS):
            regret_sum[t] += regret[t]
        if track_selection_share:
            for i in range(n):
                for t in range(ROUNDS):
                    share_sum[i][t] += share[i][t]
        for i in range(n):
            alpha_sum[i] += alphas[i]
            beta_sum[i] += betas[i]
            rate_sum[i] += rates[i]

    avg_regret = [round(v / TRIALS, 3) for v in regret_sum]
    avg_share = (
        [[round(v / TRIALS, 4) for v in row] for row in share_sum]
        if track_selection_share
        else None
    )
    avg_alphas = [round(v / TRIALS, 1) for v in alpha_sum]
    avg_betas = [round(v / TRIALS, 1) for v in beta_sum]
    avg_rates = [round(v / TRIALS, 3) for v in rate_sum]
    return avg_regret, avg_share, avg_alphas, avg_betas, avg_rates


def main():
    ts_regret, ts_share, ts_alphas, ts_betas, ts_rates = average_over_trials(
        thompson_pick, base_seed=SEED * 1000, track_selection_share=True
    )
    eg_regret, _, _, _, _ = average_over_trials(
        epsilon_greedy_pick, base_seed=SEED * 1000 + 1, track_selection_share=False
    )
    rnd_regret, _, _, _, _ = average_over_trials(
        random_pick, base_seed=SEED * 1000 + 2, track_selection_share=False
    )

    data = {
        "rounds": ROUNDS,
        "trials": TRIALS,
        "variant_names": [v["name"] for v in VARIANTS],
        "true_rates": [v["true_rate"] for v in VARIANTS],
        "thompson_regret": ts_regret,
        "epsilon_greedy_regret": eg_regret,
        "random_regret": rnd_regret,
        "selection_share_over_time": ts_share,
        "final_alphas": ts_alphas,
        "final_betas": ts_betas,
        "final_estimated_rates": ts_rates,
    }

    template_path = Path(__file__).parent / "bandit_simulation_template.html"
    output_path = Path(__file__).parent / "bandit_simulation.html"
    html = template_path.read_text(encoding="utf-8")
    html = html.replace("__SIMULATION_DATA__", json.dumps(data))
    output_path.write_text(html, encoding="utf-8")
    print(f"Wrote {output_path}")
    print(
        f"Final estimated win rates, averaged over {TRIALS} trials (true rate in parens): "
        + ", ".join(
            f"{n}={r} ({t})"
            for n, r, t in zip(data["variant_names"], data["final_estimated_rates"], data["true_rates"])
        )
    )


if __name__ == "__main__":
    main()
