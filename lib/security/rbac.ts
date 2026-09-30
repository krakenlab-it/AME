export const ADMIN_ROLES = ["ADMIN", "REVIEWER", "EXPORTER"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type Permission =
  | "dashboard:view"
  | "people:view"
  | "people:review"
  | "people:import"
  | "links:manage"
  | "export:create"
  | "audit:view"
  | "notice:manage"
  | "retention:run";

const MATRIX: Record<AdminRole, Permission[]> = {
  ADMIN: [
    "dashboard:view", "people:view", "people:review", "people:import", "links:manage",
    "export:create", "audit:view", "notice:manage", "retention:run",
  ],
  REVIEWER: ["dashboard:view", "people:view", "people:review"],
  EXPORTER: ["dashboard:view", "export:create"],
};

export function can(role: AdminRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

export class ForbiddenError extends Error {
  constructor(public permission: Permission) {
    super(`Permiso requerido: ${permission}`);
  }
}

export function assertCan(role: AdminRole | null | undefined, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
