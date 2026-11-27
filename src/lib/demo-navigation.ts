export const DEMO_SELECTION_HREF = "/demo/select";
export const H5_EXPERIMENT = "stag-hunt-h5";
export const H5_TEACHER_HREF = `/teacher?experiment=${H5_EXPERIMENT}`;
export const H5_DEMO_HREF = "/evolution/neighbors/demo";

export const DEMO_TEACHER_HREFS = {
  institutions: "/teacher?experiment=institutions",
  emh: "/teacher?experiment=emh",
  judgment: "/teacher?experiment=judgment",
  evolution: "/teacher?experiment=evolution",
} as const;
