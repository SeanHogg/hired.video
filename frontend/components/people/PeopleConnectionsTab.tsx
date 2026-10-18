import { Eye } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import PeopleCard from "@/components/PeopleCard";
import { AppEmptyState } from "@/components/app/AppEmptyState";
import { PeopleTable } from "@/components/DiscoverPeopleGrid";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import type { ConnectionStatus, UserWithOwnership } from "@/types/people";

interface PeopleConnectionsTabProps {
  tracked: UserWithOwnership[];
  viewMode: string;
  getConnectionStatus: (personId: string) => ConnectionStatus;
  onTrack: (personId: string) => void;
  onUntrack: (personId: string) => void;
  onConnect: (personId: string, message?: string) => void;
  onMessage: (personId: string) => void;
  onAcceptConnection: (connectionId: string) => void;
  onRejectConnection: (connectionId: string) => void;
  onCardActions: (personId: string) => void;
}

/**
 * Connections tab — shared across roles. Renders the user's tracked /
 * followed people and any connection state already resolved on each card.
 */
export default function PeopleConnectionsTab({
  tracked,
  viewMode,
  getConnectionStatus,
  onTrack,
  onUntrack,
  onConnect,
  onMessage,
  onAcceptConnection,
  onRejectConnection,
  onCardActions,
}: PeopleConnectionsTabProps) {
  const { t } = useTranslation();

  if (tracked.length === 0) {
    return (
      <div className="space-y-6">
        <AppEmptyState
          icon={Eye}
          title={t("headings.people.noConnectionsYet")}
          description={t("messages.people.noConnectionsDesc")}
        />
      </div>
    );
  }

  // One card definition shared by the Scroll and Grid views so the full
  // handler wiring lives in a single place (Table renders its own dense rows
  // via PeopleTable).
  const renderConnectionCard = (person: UserWithOwnership) => (
    <PeopleCard
      key={person.id}
      person={person}
      connectionStatus={getConnectionStatus(person.id)}
      layout="vertical"
      showOwnership
      onTrack={onTrack}
      onUntrack={onUntrack}
      onConnect={onConnect}
      onMessage={onMessage}
      onAcceptConnection={onAcceptConnection}
      onRejectConnection={onRejectConnection}
      onActions={() => onCardActions(person.id)}
    />
  );

  return (
    <div className="space-y-6">
      {viewMode === "table" ? (
        <PeopleTable people={tracked} />
      ) : viewMode === "scroll" ? (
        <HorizontalScroller itemCount={tracked.length}>
          {tracked.map((person) => (
            <Fragment key={person.id}>{renderConnectionCard(person)}</Fragment>
          ))}
        </HorizontalScroller>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {tracked.map((person) => renderConnectionCard(person))}
        </div>
      )}
    </div>
  );
}
