import { useTranslate } from "ra-core";
import { Link } from "react-router";
import { useIsMobile } from "@/hooks/use-mobile";

import type { Company, Contact, Deal } from "../types";
import { formatFit, isOpenDeal, parseFit, type MapMarker } from "./mapModel";

export type MarkerCardContext = {
  companiesById: Map<string, Company>;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  dealsByCompany: Map<string, Deal[]>;
  tagNames: (ids?: Contact["tags"]) => string[];
  stageLabel: (stage: string) => string;
  closedStages: string[];
  formatAmount: (amount: number) => string;
};

const Line = ({ children }: { children?: React.ReactNode }) =>
  children ? (
    <div className="text-xs text-muted-foreground">{children}</div>
  ) : null;

/** Small card shown when a map marker is clicked. */
export const MarkerCard = ({
  marker,
  context,
}: {
  marker: MapMarker;
  context: MarkerCardContext;
}) => {
  const translate = useTranslate();
  // The mobile app has no deal pages: deals link to their company there.
  const isMobile = useIsMobile();
  const company = context.companiesById.get(String(marker.companyId));
  if (!company) return null;

  const place = [company.city, company.state_abbr].filter(Boolean).join(", ");
  const openDeals = (
    context.dealsByCompany.get(String(company.id)) ?? []
  ).filter((deal) => isOpenDeal(deal, context));
  const precision = company.geocode_precision
    ? translate("crm.map.precision", {
        precision: translate(`crm.map.precisions.${company.geocode_precision}`),
      })
    : undefined;

  let title = company.name;
  let link = `/companies/${company.id}/show`;
  let details: React.ReactNode = null;
  let fit = parseFit(company.description);

  if (marker.kind === "contacts") {
    const contact = context.contactsById.get(String(marker.id));
    title = marker.title;
    link = `/contacts/${marker.id}/show`;
    fit = parseFit(company.description, context.tagNames(contact?.tags));
    details = (
      <>
        <Line>{contact?.title}</Line>
        <Line>{company.name}</Line>
      </>
    );
  } else if (marker.kind === "deals") {
    const deal = context.dealsById.get(String(marker.id));
    title = marker.title;
    if (!isMobile) link = `/deals/${marker.id}/show`;
    details = (
      <>
        <Line>
          {deal
            ? `${context.stageLabel(deal.stage)} · ${context.formatAmount(deal.amount)}`
            : null}
        </Line>
        <Line>{company.name}</Line>
      </>
    );
  }

  const fitLabel = formatFit(fit);
  return (
    <div className="flex flex-col gap-1">
      <Link
        to={link}
        className="font-semibold text-sm text-foreground hover:underline"
      >
        {title}
      </Link>
      {details}
      <Line>{place}</Line>
      {fitLabel ? (
        <Line>
          {translate("crm.map.fit")}: {fitLabel}
        </Line>
      ) : null}
      <Line>
        {translate("crm.map.open_deals", { smart_count: openDeals.length })}
      </Line>
      <Line>{precision}</Line>
      <Link to={link} className="text-xs text-primary hover:underline mt-1">
        {translate("crm.map.open_record")} →
      </Link>
    </div>
  );
};
