import { Draggable } from "@hello-pangea/dnd";
import { useListContext, useRedirect, RecordContextProvider } from "ra-core";
import { Checkbox } from "@/components/ui/checkbox";
import { ReferenceField } from "@/components/admin/reference-field";
import { NumberField } from "@/components/admin/number-field";
import { Card, CardContent } from "@/components/ui/card";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { formatDealCategories } from "./dealUtils";

export const DealCard = ({ deal, index }: { deal: Deal; index: number }) => {
  if (!deal) return null;

  return (
    <Draggable draggableId={String(deal.id)} index={index}>
      {(provided, snapshot) => (
        <DealCardContent
          provided={provided}
          snapshot={snapshot}
          deal={deal}
          selectable
        />
      )}
    </Draggable>
  );
};

export const DealCardContent = ({
  provided,
  snapshot,
  deal,
  selectable = false,
}: {
  provided?: any;
  snapshot?: any;
  deal: Deal;
  selectable?: boolean;
}) => {
  const { dealCategories, currency } = useConfigurationContext();
  const redirect = useRedirect();
  const { selectedIds, onToggleItem } = useListContext<Deal>();
  const isSelected = selectedIds?.includes(deal.id) ?? false;
  const handleClick = () => {
    redirect(`/deals/${deal.id}/show`, undefined, undefined, undefined, {
      _scrollToTop: false,
    });
  };

  return (
    <div
      className="cursor-pointer"
      {...provided?.draggableProps}
      {...provided?.dragHandleProps}
      ref={provided?.innerRef}
      onClick={handleClick}
    >
      <RecordContextProvider value={deal}>
        <Card
          className={`py-3 transition-all duration-200 ${
            snapshot?.isDragging
              ? "opacity-90 transform rotate-1 shadow-lg"
              : "shadow-sm hover:shadow-md"
          }`}
        >
          <CardContent className="px-3 flex flex-col">
            <div className="flex-1 flex items-start gap-2">
              {selectable && onToggleItem && (
                <div
                  className="cursor-pointer pt-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleItem(deal.id);
                  }}
                >
                  <Checkbox className="cursor-pointer" checked={isSelected} />
                </div>
              )}
              <p className="flex-1 text-sm font-medium mb-2">
                <ReferenceField
                  source="company_id"
                  reference="companies"
                  link={false}
                />
                {" - "}
                {deal.name}
              </p>
              <ReferenceField
                source="company_id"
                reference="companies"
                link={false}
              >
                <CompanyAvatar width={20} height={20} />
              </ReferenceField>
            </div>
            <p className="text-xs text-muted-foreground">
              <NumberField
                source="amount"
                options={{
                  notation: "compact",
                  style: "currency",
                  currency,
                  currencyDisplay: "narrowSymbol",
                  minimumSignificantDigits: 3,
                }}
              />
              {deal.categories?.length ? ", " : ""}
              {formatDealCategories(dealCategories, deal.categories)}
            </p>
          </CardContent>
        </Card>
      </RecordContextProvider>
    </div>
  );
};
