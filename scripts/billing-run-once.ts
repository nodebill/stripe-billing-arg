import { getBillingProcessorState, processDueSubscriptions } from "@/modules/billing/service";

async function main() {
  const summary = await processDueSubscriptions({
    trigger: "script",
  });
  const state = await getBillingProcessorState();

  console.log(JSON.stringify({ summary, state }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
