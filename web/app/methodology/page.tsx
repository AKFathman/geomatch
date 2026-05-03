import Link from "next/link";

import { Nav } from "@/components/Nav";

export const metadata = {
  title: "Methodology — GeoMatch",
};

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">GeoMatch</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Methodology — every data source, every transform, every formula. If
          something here looks wrong, the source is{" "}
          <a
            href="https://github.com/AKFathman/geomatch"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            on GitHub
          </a>{" "}
          — file an issue.
        </p>
      </header>

      <Nav />

      <article className="prose-neutral max-w-none space-y-10 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
        <Section
          id="overview"
          title="Overview"
        >
          <p>
            GeoMatch is two tools sharing one data backbone:
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong>Plan a test</strong> — given a target US county, find the most
              similar control counties using public-data covariates and trajectories.
            </li>
            <li>
              <strong>Analyze results</strong> — given the conversion data from a
              completed geo test, compute a covariate-adjusted lift estimate that
              corrects for imperfect matching, with honest standard errors.
            </li>
          </ul>
          <p>
            Both run entirely in your browser. The feature matrix (3,280 counties × 121
            features, ~3 MB) is fetched once from a CDN and queried via DuckDB-WASM.
            No backend, no account, nothing logged.
          </p>
        </Section>

        <Section id="data-sources" title="Data sources">
          <p>
            All free, all public, refreshed nightly via GitHub Actions. The cron pulls
            each source, builds a long-format DataFrame, computes derived features, and
            commits an updated parquet to <code>web/public/data/</code> — which Vercel
            then deploys to the CDN.
          </p>
          <table className="w-full text-xs">
            <thead className="border-b border-neutral-200 text-left dark:border-neutral-800">
              <tr>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Provides</th>
                <th className="py-2 pr-3">Cadence</th>
                <th className="py-2">Lag</th>
              </tr>
            </thead>
            <tbody className="text-neutral-700 dark:text-neutral-300">
              <tr className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-3 font-mono">Census ACS 5-year</td>
                <td className="py-2 pr-3">
                  Demographics, income, education, housing, vehicles, commute (≈20
                  curated variables × 5 years)
                </td>
                <td className="py-2 pr-3">Annual</td>
                <td className="py-2">~9 months</td>
              </tr>
              <tr className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-3 font-mono">BLS LAUS</td>
                <td className="py-2 pr-3">
                  Unemployment rate, labor force, employment count
                </td>
                <td className="py-2 pr-3">Monthly</td>
                <td className="py-2">~1 month</td>
              </tr>
              <tr className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-3 font-mono">BEA Regional</td>
                <td className="py-2 pr-3">
                  Personal income, per-capita personal income, BEA population
                </td>
                <td className="py-2 pr-3">Annual</td>
                <td className="py-2">~6 months</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-mono">Zillow Research</td>
                <td className="py-2 pr-3">Home values (ZHVI), rents (ZORI)</td>
                <td className="py-2 pr-3">Monthly</td>
                <td className="py-2">~1 month</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-neutral-500">
            Roadmap: FBI Crime Data (NIBRS), CDC PLACES, FCC Broadband, BLS QCEW
            industry employment.
          </p>
          <p>
            Each connector lives in <code>etl/sources/</code> on GitHub.
          </p>
        </Section>

        <Section id="features" title="Feature engineering">
          <p>
            For every base metric we compute four derived features (five for monthly
            metrics). All standardized across all US counties so they&apos;re
            comparable.
          </p>
          <ul className="list-disc pl-6">
            <li>
              <code>__level</code> — z-scored most-recent annual value
            </li>
            <li>
              <code>__slope</code> — 3-year linear-regression coefficient (units per
              year)
            </li>
            <li>
              <code>__yoy</code> — most recent year-over-year % change
            </li>
            <li>
              <code>__vol</code> — std-dev of YoY changes over the available window
            </li>
            <li>
              <code>__seas</code> — seasonality strength (variance of monthly means
              relative to total variance) — only on monthly metrics
            </li>
          </ul>
          <p>
            This is the &ldquo;trajectory-aware&rdquo; piece — most existing GeoLIFT
            tooling matches on KPI time series alone or on level demographics; GeoMatch
            includes how each metric is <em>moving</em>, which matters when contextual
            similarity needs to hold across the test window.
          </p>
          <p className="text-xs text-neutral-500">
            Source: <code>etl/features/transforms.py</code>
          </p>
        </Section>

        <Section id="matcher" title="The matcher (Plan a test)">
          <p>
            Given a target county, an industry preset (or custom weights), and a
            population band, returns the top-25 candidate control counties.
          </p>
          <h3 className="mt-4 text-base font-semibold">Algorithm</h3>
          <ol className="list-decimal pl-6">
            <li>
              <strong>Expand base weights</strong>. Each industry preset weight is
              keyed by base metric (e.g., <code>median_household_income</code>). At
              compute time we split each base weight across its derived features —{" "}
              <span className="font-mono text-xs">
                50% level · 20% slope · 20% YoY · 10% vol
              </span>{" "}
              — renormalized over whichever derivatives are present.
            </li>
            <li>
              <strong>Auto-normalize</strong>. The custom weight sliders are
              renormalized to sum to 1 before computing distance, so users don&apos;t
              have to balance them manually.
            </li>
            <li>
              <strong>Weighted Euclidean distance</strong>. For target z-scores{" "}
              <code>x</code> and candidate z-scores <code>y</code>:{" "}
              <code className="font-mono">
                d(x, y) = √( Σ wⱼ · (xⱼ − yⱼ)² )
              </code>
              . Lower = closer.
            </li>
            <li>
              <strong>Filters</strong>. Drop the target itself, candidates outside the
              user&apos;s population band, and candidates with too few non-null shared
              features.
            </li>
            <li>
              <strong>Sort and slice</strong>. Top-K by distance.
            </li>
            <li>
              <strong>Top contributors</strong>. The per-candidate{" "}
              <code>contributions</code> map is{" "}
              <code className="font-mono">wⱼ · (xⱼ − yⱼ)²</code> per feature, summed by
              base metric, sorted descending. That&apos;s the &ldquo;why this
              matched&rdquo; column.
            </li>
          </ol>
          <h3 className="mt-4 text-base font-semibold">Why not synthetic control?</h3>
          <p>
            Meta&apos;s GeoLift R-package fits a synthetic control on the pre-period
            KPI time series. That&apos;s the <em>statistical</em> match. GeoMatch is
            the <em>contextual</em> pre-screen: it surfaces candidates that are
            structurally similar so the synthetic control has a fair chance of working,
            and so the resulting test/control pairing has face validity with
            stakeholders. The two approaches complement each other.
          </p>
          <h3 className="mt-4 text-base font-semibold">Distance interpretation</h3>
          <p>
            Roughly: <code>d</code> is &ldquo;weighted-RMS standard deviations from
            the target.&rdquo; Lower bands and what they mean:
          </p>
          <ul className="list-disc pl-6">
            <li>
              <code>&lt; 0.3</code> — excellent; likely indistinguishable on the
              metrics you weighted
            </li>
            <li>
              <code>0.3 – 0.6</code> — good; small differences, defensible match
            </li>
            <li>
              <code>0.6 – 1.0</code> — moderate; check the contributors column
            </li>
            <li>
              <code>&gt; 1.0</code> — weak; widen the population band or reweight
            </li>
          </ul>
          <p className="text-xs text-neutral-500">
            Source: <code>web/lib/match.ts</code>, <code>web/lib/data.ts</code>{" "}
            (<code>expandWeights</code>)
          </p>
        </Section>

        <Section id="analyzer" title="The analyzer (Analyze results)">
          <p>
            Given a CSV of test/control conversions, returns a covariate-adjusted lift
            estimate per channel with 95% CIs and p-values.
          </p>
          <h3 className="mt-4 text-base font-semibold">Pipeline (per channel)</h3>
          <ol className="list-decimal pl-6">
            <li>
              <strong>Aggregate</strong>. Sum <code>outcome</code> (and{" "}
              <code>exposures</code>, if provided) per <code>fips</code> + channel —
              one row per geo per channel.
            </li>
            <li>
              <strong>Outcome variable</strong>. If <code>exposures</code> is provided
              and positive, use the rate <code>outcome / exposures</code>. Otherwise
              use the raw count. Lift is computed in the same units.
            </li>
            <li>
              <strong>Naive (raw) estimate</strong>. Welch&apos;s two-sample t-test on
              the outcomes by group:{" "}
              <code className="font-mono">
                lift_naive = (mean_T − mean_C) / mean_C
              </code>
              ; SE from{" "}
              <code className="font-mono">
                √( var_T / n_T + var_C / n_C )
              </code>
              .
            </li>
            <li>
              <strong>Adjusted estimate</strong>. Build a design matrix{" "}
              <code className="font-mono">
                X = [1, treatment, level₁, level₂, …]
              </code>{" "}
              using the <code>__level</code> features (~30 of them). Fit closed-form
              ridge regression:
              <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-100 p-3 font-mono text-xs dark:bg-neutral-900">
{`β = (XᵀX + λI)⁻¹ Xᵀy`}
              </pre>
              with λ scaled by <code>k / n</code> so it adapts to whatever sample size
              you have. The intercept column is not penalized.
            </li>
            <li>
              <strong>Sandwich (heteroskedasticity-robust) SEs</strong>. The classical
              SE assumes homoskedastic errors, which is unrealistic for geo data —
              variance scales with population, market size, etc. We use Huber-White:
              <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-100 p-3 font-mono text-xs dark:bg-neutral-900">
{`V = (XᵀX)⁻¹ · Xᵀ diag(ε²) X · (XᵀX)⁻¹
where ε = y − Xβ
SE_j = √(V_jj)`}
              </pre>
              For the inference matrix we use the unregularized{" "}
              <code>(XᵀX)⁻¹</code> when invertible, falling back to the ridged version
              otherwise.
            </li>
            <li>
              <strong>Inference</strong>. <code>z = β / SE</code>; two-sided p-value
              from the standard-normal CDF; CI = <code>β ± 1.96·SE</code>. Large-sample
              normal approximation; we don&apos;t use a t-distribution because the
              sandwich estimator is itself only large-sample valid.
            </li>
            <li>
              <strong>Convert to %</strong>.{" "}
              <code className="font-mono">
                lift_pct = β_treatment / mean(y | control)
              </code>
              . CIs scale linearly. (Delta-method approximation; control mean variance
              is small relative to β variance at typical sample sizes.)
            </li>
            <li>
              <strong>Selection diagnostic</strong>. For every level feature: Welch&apos;s
              t-test of test mean vs control mean, in z-score units. Sorted by{" "}
              <code>|Δ|</code>, top 8 shown. Large Δs are exactly what the regression
              adjusted for.
            </li>
          </ol>
          <h3 className="mt-4 text-base font-semibold">Why ridge?</h3>
          <p>
            Geo tests often have 30–100 observations against ~30 covariates. OLS
            without regularization is unstable in that regime — coefficients are
            sensitive to which features happened to be in the test set. Ridge
            (Tikhonov) trades a small amount of bias for substantially lower variance,
            and the bias only matters for the covariates, not for the treatment
            coefficient (which is what we&apos;re reporting).
          </p>
          <h3 className="mt-4 text-base font-semibold">Why sandwich SEs?</h3>
          <p>
            Geo data is heteroskedastic by construction: variance of conversion counts
            scales with exposure volume, which scales with population. Classical
            (homoskedastic) SEs would be too narrow on big-county observations and too
            wide on small ones — biasing the inference toward false positives or false
            negatives unpredictably. Sandwich SEs are robust to this.
          </p>
          <p className="text-xs text-neutral-500">
            Source: <code>web/lib/regression.ts</code>, <code>web/lib/analyze.ts</code>
            , <code>web/lib/linalg.ts</code>
          </p>
        </Section>

        <Section id="synthetic-dataset" title="The synthetic dataset">
          <p>
            On the analyzer page, the &ldquo;Load sample&rdquo; button loads a 720-row
            synthetic dataset designed to demonstrate the adjustment&apos;s value.
            It&apos;s deliberately biased — exactly the failure mode we want to catch.
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong>120 counties</strong>: 60 test (sampled from population rank
              1–80), 60 control (rank 81–220). Same overall pop range, but test cells
              skew toward the biggest, denser markets.
            </li>
            <li>
              <strong>6 channels</strong> — google_search (+25%), meta (+15%), ctv
              (+12%), youtube (+8%), tiktok (+3%), snap (−1%). Each channel has its own
              baseline rate, exposure share of population, and log-normal county-level
              noise SD calibrated to roughly match real channel characteristics.
            </li>
            <li>
              <strong>Population-correlated baselines</strong> — bigger markets
              naturally convert at slightly higher rates, on top of the true test
              effect. This is what creates the structural bias the regression must
              correct for.
            </li>
          </ul>
          <p>
            The naive lift estimate on this dataset will read inflated by ~5–15 pp
            across channels. The adjusted estimate should recover values close to the
            true lifts, with 95% CIs that contain the truth. The selection diagnostic
            should flag large positive Δs on income, education, population, home
            values, broadband, etc. for test vs control.
          </p>
          <p className="text-xs text-neutral-500">
            Source: <code>scripts/generate_test_dataset.py</code> (reproducible — fixed
            seed)
          </p>
        </Section>

        <Section id="limitations" title="Honest limitations">
          <p>
            A short list of things the tool currently does <em>not</em> do — no point
            pretending otherwise.
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong>No doubly-robust estimator yet</strong> — the analyzer relies
              entirely on the regression&apos;s ability to capture the right functional
              form. If the relationship between covariates and outcome is wildly
              nonlinear, adjustment can still be biased. Phase 2B adds inverse-propensity
              weighting on top of regression, which gives correct estimates if{" "}
              <em>either</em> the propensity model <em>or</em> the outcome model is
              correctly specified.
            </li>
            <li>
              <strong>No pre-period (DiD)</strong> — we adjust on cross-sectional
              covariates only. If your test had a pre-period, a difference-in-differences
              specification would also absorb time-invariant unobservables. Phase 2C.
            </li>
            <li>
              <strong>Cannot fix unobserved confounders</strong> — if a competitor ran a
              concurrent promotion in your control cells (or weather, or anything else
              we don&apos;t see), no covariate adjustment recovers from that. The
              selection diagnostic shows what we adjusted for; what we don&apos;t see,
              we don&apos;t fix.
            </li>
            <li>
              <strong>County-level only</strong> — we don&apos;t aggregate to DMA or
              CBSA yet. Your test cells need to be expressible in 5-digit county FIPS.
            </li>
            <li>
              <strong>No t-distribution</strong> — we use the standard-normal CDF for
              p-values. Fine for n &gt; ~30 per group; a touch optimistic at very small
              samples.
            </li>
            <li>
              <strong>Approximate delta method for % CIs</strong> — we divide the β CI
              by the control mean. That ignores the (small) variance of the control
              mean itself. At typical sample sizes the error is negligible; at n &lt;
              10 per arm it would be visible.
            </li>
            <li>
              <strong>FBI / health / broadband / industry-employment data not yet in
              the matrix</strong> — Phase 2 of the data pipeline. The current ~30
              level features cover demographics, income, education, housing, vehicles,
              commute, employment, home values, and rents.
            </li>
          </ul>
        </Section>

        <Section id="roadmap" title="Roadmap">
          <ul className="list-disc pl-6">
            <li>
              <strong>Phase 2B</strong> — Doubly-robust estimator: add a logistic
              propensity model for treatment assignment and combine via the
              augmented inverse-propensity weighting (AIPW) estimator. Same input
              CSV, additional adjusted-lift number with stronger guarantees.
            </li>
            <li>
              <strong>Phase 2C</strong> — Pre-period support: extend the CSV schema
              with pre-period rows, fit a difference-in-differences specification,
              show pre/post balance.
            </li>
            <li>
              <strong>Phase 2D</strong> — Synthetic-control output on the matcher: not
              just the top-K list, but a weighted combination of N counties whose
              feature vector best matches the target.
            </li>
            <li>
              <strong>Phase 3</strong> — DMA / CBSA aggregation, FBI/CDC/FCC/QCEW data
              sources, browser-saved configs and shareable URLs, GeoLift R-package
              export format.
            </li>
          </ul>
        </Section>

        <Section id="source" title="Source code">
          <p>
            Everything is open source — repo at{" "}
            <a
              href="https://github.com/AKFathman/geomatch"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              github.com/AKFathman/geomatch
            </a>
            .
          </p>
          <p className="font-mono text-xs">
            ETL: <Link href="https://github.com/AKFathman/geomatch/tree/main/etl" className="underline">etl/</Link>
            <br />
            Frontend matcher: web/components/MatcherShell.tsx, web/lib/match.ts
            <br />
            Frontend analyzer: web/components/AnalyzerShell.tsx, web/lib/analyze.ts,
            web/lib/regression.ts, web/lib/linalg.ts
            <br />
            Synthetic dataset generator: scripts/generate_test_dataset.py
            <br />
            Nightly cron + Vercel deploy: .github/workflows/etl.yml
          </p>
          <p>
            Built with Claude Code (build) · GitHub CLI (version control) · Vercel
            (host) · OpenAI Codex (review). Public datasets only — Census ACS, BLS
            LAUS, BEA Regional, Zillow Research.
          </p>
        </Section>
      </article>

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        <p>
          See something wrong? File an issue on{" "}
          <a
            href="https://github.com/AKFathman/geomatch/issues"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            GitHub
          </a>
          .
        </p>
      </footer>
    </main>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 border-b border-neutral-200 pb-1 text-xl font-semibold tracking-tight dark:border-neutral-800">
        <a
          href={`#${id}`}
          className="hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          {title}
        </a>
      </h2>
      <div className="space-y-3 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs dark:[&_code]:bg-neutral-900">
        {children}
      </div>
    </section>
  );
}
