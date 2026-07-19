import { onRequestPost as __api_generate_summary_ts_onRequestPost } from "/app/applet/functions/api/generate-summary.ts"
import { onRequest as __api_jobs_ts_onRequest } from "/app/applet/functions/api/jobs.ts"
import { onRequest as __api_sitemap_ts_onRequest } from "/app/applet/functions/api/sitemap.ts"
import { onRequest as __api_sync_firebase_ts_onRequest } from "/app/applet/functions/api/sync-firebase.ts"
import { onRequest as ____path___ts_onRequest } from "/app/applet/functions/[[path]].ts"

export const routes = [
    {
      routePath: "/api/generate-summary",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_generate_summary_ts_onRequestPost],
    },
  {
      routePath: "/api/jobs",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_jobs_ts_onRequest],
    },
  {
      routePath: "/api/sitemap",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_sitemap_ts_onRequest],
    },
  {
      routePath: "/api/sync-firebase",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_sync_firebase_ts_onRequest],
    },
  {
      routePath: "/:path*",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [____path___ts_onRequest],
    },
  ]