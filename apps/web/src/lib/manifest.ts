import { modules } from "@a1plus/domain";

export const authRoutes = ["/login", "/register"];
export const workspaceRoutes = modules.map((moduleItem) => moduleItem.href);
export const flowRoutes = ["/trademark/application", "/trademark/submit"];
export const allAppRoutes = ["/", ...authRoutes, ...workspaceRoutes, ...flowRoutes];
