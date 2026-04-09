import type { BootstrapManifest } from "./types";

export const bootstrapManifest: BootstrapManifest = {
  meters: [
    {
      display_name: "TPV",
      event_name: "processed_volume",
      default_aggregation: {
        formula: "sum",
      },
    },
  ],
  products: [
    {
      name: "Procesamiento de transferencias",
      description: "Conciliación de pagos por transferencia bancaria para ecommerce. ",
      active: true,
      metadata: {},
    },
  ],
};
