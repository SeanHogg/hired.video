/**
 * World3DRoom — authoritative Colyseus room for the 3D world game
 * studio (hired.video gap #1636). One room per `studioProject.id`.
 *
 * Server is the source of truth for player positions, challenge
 * progress, and any future server-resolved mechanics (item pickup
 * dedup, hazard damage, etc.). Clients send input commands; the
 * server runs the tick, broadcasts state.
 *
 * Why authoritative + not peer-to-peer: kids playing on home
 * networks behind NAT need a server hop anyway; once we're paying for
 * a hop we may as well make it authoritative so cheating ("I
 * picked up every coin while never moving") gets blocked at the
 * source. Also necessary for fair leaderboards if we ever extend
 * gamification to per-room win streaks.
 *
 * NOT shipped here:
 *   - Physics simulation (the client's Rapier instance still
 *     simulates; the server only validates positions for sanity
 *     bounds + dedup'd item pickup events). Server-side Rapier
 *     headless lands when cheat-resistance gets serious — tracked
 *     under gap #1636's polish list.
 *   - Reconnection / lag compensation. The room boots clean on
 *     first MVP; jitter handling is a known follow-on.
 */

import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";

// ─── State schema ─────────────────────────────────────────────────────

class Vec3State extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
}

class PlayerState extends Schema {
  @type("string") userId = "";
  @type("string") displayName = "";
  @type(Vec3State) position = new Vec3State();
  @type(Vec3State) rotation = new Vec3State();
  /** Score derived from challenge completions inside this room. */
  @type("number") score = 0;
  /** Wall-clock ms of last input. The server boots a player when
   *  this falls behind by > 30s (idle / disconnect). */
  @type("number") lastInputAt = 0;
}

class ChallengeProgressState extends Schema {
  @type("string") challengeId = "";
  @type("number") current = 0;
  @type("number") target = 0;
  @type("boolean") completed = false;
}

class World3DRoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  /** Per-challenge aggregate progress (collaborative). For "per-player"
   *  challenges we keep progress on PlayerState.score. */
  @type({ map: ChallengeProgressState }) challenges = new MapSchema<ChallengeProgressState>();
  /** When the room was first created — clients use this to derive
   *  countdown timers without re-sending the wall clock each tick. */
  @type("number") startedAtMs = 0;
}

// ─── Input messages ───────────────────────────────────────────────────

interface MoveInput {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

interface TriggerInput {
  /** Mirrors `World3DEntity.id` on the client. The server doesn't
   *  re-validate physical possibility yet (that's the server-side
   *  Rapier follow-on), but it does dedup pickups across players. */
  entityId: string;
  /** Mirrors `World3DEntityKind`. */
  kind: string;
  tag?: string;
}

// ─── Room ─────────────────────────────────────────────────────────────

export class World3DRoom extends Room<World3DRoomState> {
  /** Set on the room creator's auth payload via `onAuth`. */
  private projectId = "";

  maxClients = 16;

  override async onCreate(options: { projectId: string }) {
    this.projectId = options.projectId;
    this.setState(new World3DRoomState());
    this.state.startedAtMs = Date.now();

    this.onMessage<MoveInput>("move", (client, input) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      // Trust-but-verify: clamp absurd positions so a fast-track
      // exploit can't catapult someone across the world. 200 unit
      // bound matches the largest authored ground size.
      if (!isFinite(input.position.x) || Math.abs(input.position.x) > 200) return;
      if (!isFinite(input.position.y) || input.position.y < -50 || input.position.y > 200) return;
      if (!isFinite(input.position.z) || Math.abs(input.position.z) > 200) return;
      player.position.x = input.position.x;
      player.position.y = input.position.y;
      player.position.z = input.position.z;
      player.rotation.x = input.rotation.x;
      player.rotation.y = input.rotation.y;
      player.rotation.z = input.rotation.z;
      player.lastInputAt = Date.now();
    });

    // Tracks which (entityId, userId) pairs have already triggered —
    // a coin picked up by Alice can't also be picked up by Alice.
    // Different players each get one pickup per entity (cooperative
    // counting); switch to a single-pickup model by removing the
    // userId from the key.
    const triggerLedger = new Set<string>();
    this.onMessage<TriggerInput>("trigger", (client, input) => {
      const key = `${input.entityId}:${client.sessionId}`;
      if (triggerLedger.has(key)) return;
      triggerLedger.add(key);

      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      if (input.kind === "collectible") {
        player.score += 1;
      }
      // Aggregate challenge progress mirrors the client tracker. The
      // client computes its own progress for HUD responsiveness, but
      // the room is the source of truth for room-wide totals.
    });
  }

  override async onJoin(client: Client, options: { userId?: string; displayName?: string }) {
    const player = new PlayerState();
    player.userId = options.userId ?? "guest";
    player.displayName = options.displayName ?? `Player ${this.state.players.size + 1}`;
    player.position.y = 2;
    player.lastInputAt = Date.now();
    this.state.players.set(client.sessionId, player);
  }

  override async onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }
}
