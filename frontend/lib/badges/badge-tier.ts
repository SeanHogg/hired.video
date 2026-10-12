/** Badge tier — drives the earned-badge gradient (components/badges/BadgeIcon)
 *  and the celebration toast payload (lib/points/celebration). Open-ended
 *  `string` so new tiers from the API render with the default styling. */
export type BadgeTier = "bronze" | "silver" | "gold" | string;
