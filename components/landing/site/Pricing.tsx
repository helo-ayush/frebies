"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { tools, type Tool } from "@/lib/registry/tools";
import { Arrow, EASE, MaskLines, Rule, Sq, useMedia } from "./kit";

const free = tools.filter((tool) => tool.tier === "free");
const credits = tools.filter((tool) => tool.tier === "credits");

type Plan = {
  key: string;
  name: string;
  lines: string[];
  phoneLines: string[];
  list: Tool[];
  stats: { value: string; label: string[] }[];
  cta: { label: string; href: string };
};

const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free tools",
    lines: ["The everyday tools", "cost nothing, and they", "don't ask who you are."],
    phoneLines: ["The everyday", "tools cost", "nothing, and they", "don't ask", "who you are."],
    list: free,
    stats: [
      { value: String(free.length), label: ["Tools, free", "for good"] },
      { value: "0", label: ["Accounts", "needed"] },
    ],
    cta: { label: "Start free", href: "/dashboard" },
  },
  {
    key: "credits",
    name: "AI credits",
    lines: ["AI tools run on credits.", "The price is on the button", "before you press it."],
    phoneLines: ["AI tools run", "on credits. The", "price is on the", "button before", "you press it."],
    list: credits,
    stats: [
      { value: "25", label: ["Credits when", "you sign up"] },
      { value: "0", label: ["Charged if", "a run fails"] },
    ],
    cta: { label: "Get 25 credits", href: "/sign-up" },
  },
];

export function Pricing() {
  const [index, setIndex] = useState(0);
  const plan = PLANS[index];
  const phone = useMedia("(max-width: 639px)");
  const step = (by: number) => setIndex((value) => (value + by + PLANS.length) % PLANS.length);

  return (
    <section id="pricing" aria-label="Pricing" className="relative scroll-mt-[var(--lp-nav)] pt-[clamp(72px,8vw,130px)]">
      <div className="relative mx-[var(--lp-pad)] border-t border-[var(--lp-line)]">
        <Rule vertical className="bottom-0 left-0 top-0 hidden md:left-[18%] md:block" />
        <div className="grid md:grid-cols-[18%_minmax(0,1fr)]">
          <div className="flex items-center justify-between gap-6 py-7 md:flex-col md:items-start md:py-9">
            <p className="lp-label flex items-center gap-3">
              <Sq />
              Pricing //
            </p>
            <p className="lp-wide text-[24px]">
              0{index + 1}
              <span className="ml-1.5 text-[13px] text-[var(--lp-muted)]">/ 0{PLANS.length}</span>
            </p>
          </div>

          <div className="pb-12 md:pl-9 md:pt-9">
            {/* Both plans are named, so the arrows are never the only way to reach one */}
            <div role="tablist" aria-label="Plans" className="flex gap-7">
              {PLANS.map((item, at) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={at === index}
                  onClick={() => setIndex(at)}
                  className={`relative pb-2.5 text-[15px] uppercase transition-colors ${
                    at === index ? "" : "text-[var(--lp-muted)] hover:text-[var(--lp-ink)]"
                  }`}
                >
                  {item.name}
                  {at === index && (
                    <motion.span
                      layoutId="lp-plan"
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--lp-coral)]"
                      transition={{ duration: 0.45, ease: EASE }}
                    />
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={plan.key} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="mt-9 md:min-h-[420px] lg:min-h-[390px]">
                <MaskLines
                  key={phone ? "phone" : "wide"}
                  as="h2"
                  className="lp-wide text-[clamp(25px,3.5vw,58px)] !leading-[1.04]"
                  lines={phone ? plan.phoneLines : plan.lines}
                />
                <ul className="mt-10 grid max-w-[1080px] gap-x-10 sm:grid-cols-2 xl:grid-cols-3">
                  {plan.list.map((tool, at) => (
                    <motion.li
                      key={tool.path}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.2 + at * 0.03, ease: EASE }}
                      className="border-t border-[var(--lp-line)]"
                    >
                      <Link
                        href={tool.path}
                        className="flex items-baseline justify-between gap-4 py-3 text-[16px] transition-[padding,color] duration-300 hover:pl-2 hover:text-[var(--lp-coral)]"
                      >
                        {tool.name}
                        <span className="lp-label !text-[12px]">
                          {tool.status === "soon"
                            ? "Preview"
                            : tool.tier === "free"
                              ? "Free"
                              : `${tool.creditCost} ${tool.creditCost === 1 ? "credit" : "credits"}`}
                        </span>
                      </Link>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="grid border-t border-[var(--lp-line)] md:grid-cols-[18%_minmax(0,1fr)_auto]">
          <div className="grid grid-cols-2 max-md:order-last max-md:h-[64px]">
            {[-1, 1].map((by) => (
              <button
                key={by}
                type="button"
                onClick={() => step(by)}
                aria-label={by < 0 ? "Previous plan" : "Next plan"}
                className="grid place-items-center border-r border-[var(--lp-line)] transition-colors hover:bg-[var(--lp-coral)] hover:text-white max-md:border-b"
              >
                <span className={by < 0 ? "rotate-180" : ""}>
                  <Arrow />
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-14 gap-y-5 bg-[var(--lp-panel)] px-6 py-8 md:px-9">
            {plan.stats.map((stat) => (
              <div key={`${plan.key}-${stat.label[0]}`} className="flex items-center gap-4">
                <MaskLines immediate className="lp-wide text-[clamp(40px,3.6vw,58px)]" lines={[stat.value]} />
                <p className="lp-label">
                  {stat.label[0]}
                  <br />
                  {stat.label[1]}
                </p>
              </div>
            ))}
          </div>
          <Link
            href={plan.cta.href}
            className="lp-btn lp-ear !h-auto min-h-[84px] !px-[clamp(32px,5vw,84px)]"
            style={{ ["--ear" as string]: "22px" }}
          >
            {plan.cta.label}
            <Arrow />
          </Link>
        </div>
      </div>
    </section>
  );
}
