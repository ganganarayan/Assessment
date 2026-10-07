import { redirect } from "next/navigation";

export default function WorkspaceHome() {
  // The dashboard, not the assessments list: on day one that list is empty by
  // definition, and an empty list is not an introduction to the product.
  redirect("/w/dashboard");
}
