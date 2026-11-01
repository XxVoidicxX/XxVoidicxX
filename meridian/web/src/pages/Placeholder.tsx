import { Construction } from "lucide-react";
import { PageHeader, EmptyState, Card } from "@/components/ui";

export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card><EmptyState icon={Construction} title={`${title} is under construction`} description="This module is being built." /></Card>
    </>
  );
}
