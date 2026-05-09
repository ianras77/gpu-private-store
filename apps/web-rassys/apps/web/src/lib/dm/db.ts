import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { seedDmReferenceData } from "./reference-seed";

type SqlValue = string | number | boolean | null | Date | object;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not set. DM backend requires Postgres.");
}

const globalForDmDb = globalThis as unknown as {
  dmPool?: Pool;
  dmSchemaPromise?: Promise<void>;
};

const pool =
  globalForDmDb.dmPool ??
  new Pool({
    connectionString,
    max: Number(process.env.DM_DB_POOL_MAX ?? 15),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: "web-dm-backend"
  });

if (!globalForDmDb.dmPool) {
  globalForDmDb.dmPool = pool;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS dm_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_normalized TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ
    )`,
  `CREATE TABLE IF NOT EXISTS dm_systems (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      rules_primer TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_compendium_sources (
      id TEXT PRIMARY KEY,
      system_id TEXT NOT NULL REFERENCES dm_systems(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_uri TEXT,
      version_label TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_compendium_entries (
      id TEXT PRIMARY KEY,
      system_id TEXT NOT NULL REFERENCES dm_systems(id) ON DELETE CASCADE,
      source_id TEXT REFERENCES dm_compendium_sources(id) ON DELETE SET NULL,
      source_ref TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      rules_text TEXT NOT NULL DEFAULT '',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(system_id, source_ref)
    )`,
  `CREATE TABLE IF NOT EXISTS dm_compendium_links (
      id TEXT PRIMARY KEY,
      system_id TEXT NOT NULL REFERENCES dm_systems(id) ON DELETE CASCADE,
      from_entry_id TEXT NOT NULL REFERENCES dm_compendium_entries(id) ON DELETE CASCADE,
      to_entry_id TEXT NOT NULL REFERENCES dm_compendium_entries(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      system_id TEXT NOT NULL REFERENCES dm_systems(id) ON DELETE RESTRICT,
      description TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES dm_users(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'active',
      story_summary TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_memberships (
      user_id TEXT NOT NULL REFERENCES dm_users(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, campaign_id)
    )`,
  `CREATE TABLE IF NOT EXISTS dm_world_state (
      campaign_id TEXT PRIMARY KEY REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      world_time TEXT NOT NULL,
      weather TEXT NOT NULL,
      active_threats JSONB NOT NULL DEFAULT '[]'::jsonb,
      scene_summary TEXT NOT NULL,
      story_beat TEXT NOT NULL,
      visual_prompt TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_sessions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      started_by_user_id TEXT NOT NULL REFERENCES dm_users(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'active',
      current_turn INTEGER NOT NULL DEFAULT 0,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at TIMESTAMPTZ
    )`,
  `CREATE TABLE IF NOT EXISTS dm_characters (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES dm_users(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      archetype TEXT NOT NULL,
      archetype_entry_id TEXT REFERENCES dm_compendium_entries(id) ON DELETE SET NULL,
      player_type TEXT,
      level INTEGER NOT NULL,
      hp_current INTEGER NOT NULL,
      hp_max INTEGER NOT NULL,
      hp_temp INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      notes TEXT,
      special_traits JSONB NOT NULL DEFAULT '[]'::jsonb,
      system_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `ALTER TABLE dm_characters ADD COLUMN IF NOT EXISTS player_type TEXT`,
  `ALTER TABLE dm_characters ADD COLUMN IF NOT EXISTS archetype_entry_id TEXT REFERENCES dm_compendium_entries(id) ON DELETE SET NULL`,
  `ALTER TABLE dm_characters ADD COLUMN IF NOT EXISTS special_traits JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE dm_characters ADD COLUMN IF NOT EXISTS system_data JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `CREATE TABLE IF NOT EXISTS dm_character_attributes (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES dm_characters(id) ON DELETE CASCADE,
      system_id TEXT NOT NULL REFERENCES dm_systems(id) ON DELETE RESTRICT,
      attr_key TEXT NOT NULL,
      value_num DOUBLE PRECISION,
      value_text TEXT,
      value_json JSONB,
      source TEXT NOT NULL DEFAULT 'sheet',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(character_id, attr_key)
    )`,
  `CREATE TABLE IF NOT EXISTS dm_character_actions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES dm_characters(id) ON DELETE CASCADE,
      system_id TEXT NOT NULL REFERENCES dm_systems(id) ON DELETE RESTRICT,
      compendium_entry_id TEXT REFERENCES dm_compendium_entries(id) ON DELETE SET NULL,
      action_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      action_type TEXT NOT NULL DEFAULT 'special',
      uses_current INTEGER,
      uses_max INTEGER,
      cooldown_turns INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(character_id, action_key)
    )`,
  `ALTER TABLE dm_character_actions ADD COLUMN IF NOT EXISTS compendium_entry_id TEXT REFERENCES dm_compendium_entries(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS dm_inventory_items (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES dm_characters(id) ON DELETE CASCADE,
      compendium_entry_id TEXT REFERENCES dm_compendium_entries(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      detail TEXT,
      quantity INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `ALTER TABLE dm_inventory_items ADD COLUMN IF NOT EXISTS compendium_entry_id TEXT REFERENCES dm_compendium_entries(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS dm_quests (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_quest_objectives (
      id TEXT PRIMARY KEY,
      quest_id TEXT NOT NULL REFERENCES dm_quests(id) ON DELETE CASCADE,
      ord INTEGER NOT NULL DEFAULT 0,
      text TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT false
    )`,
  `CREATE TABLE IF NOT EXISTS dm_turns (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES dm_sessions(id) ON DELETE SET NULL,
      turn_index INTEGER NOT NULL,
      idempotency_key TEXT,
      actor_user_id TEXT NOT NULL REFERENCES dm_users(id) ON DELETE RESTRICT,
      actor_character_id TEXT REFERENCES dm_characters(id) ON DELETE SET NULL,
      action_text TEXT NOT NULL,
      context_payload JSONB,
      llm_narration TEXT,
      llm_patch JSONB,
      applied_patch JSONB,
      result_payload JSONB,
      prompt_hash TEXT,
      model TEXT,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_at TIMESTAMPTZ
    )`,
  `CREATE TABLE IF NOT EXISTS dm_events (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES dm_sessions(id) ON DELETE SET NULL,
      turn_id TEXT REFERENCES dm_turns(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      actor_user_id TEXT REFERENCES dm_users(id) ON DELETE SET NULL,
      actor_character_id TEXT REFERENCES dm_characters(id) ON DELETE SET NULL,
      summary TEXT NOT NULL,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_dice_rolls (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES dm_sessions(id) ON DELETE SET NULL,
      turn_id TEXT REFERENCES dm_turns(id) ON DELETE SET NULL,
      actor_user_id TEXT REFERENCES dm_users(id) ON DELETE SET NULL,
      actor_character_id TEXT REFERENCES dm_characters(id) ON DELETE SET NULL,
      expression TEXT NOT NULL,
      dice_count INTEGER NOT NULL,
      dice_sides INTEGER NOT NULL,
      modifier INTEGER NOT NULL DEFAULT 0,
      rolls JSONB NOT NULL DEFAULT '[]'::jsonb,
      total INTEGER NOT NULL,
      critical_success BOOLEAN NOT NULL DEFAULT false,
      critical_failure BOOLEAN NOT NULL DEFAULT false,
      reason TEXT,
      summary TEXT NOT NULL,
      outcome_status TEXT NOT NULL DEFAULT 'recorded',
      outcome_summary TEXT,
      outcome_payload JSONB,
      request_idempotency_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ
    )`,
  `CREATE TABLE IF NOT EXISTS dm_state_transitions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES dm_sessions(id) ON DELETE SET NULL,
      turn_id TEXT REFERENCES dm_turns(id) ON DELETE SET NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      actor_user_id TEXT REFERENCES dm_users(id) ON DELETE SET NULL,
      actor_character_id TEXT REFERENCES dm_characters(id) ON DELETE SET NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      field_path TEXT NOT NULL,
      transition_type TEXT NOT NULL DEFAULT 'set',
      old_value JSONB,
      new_value JSONB,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_checkpoints (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      turn_id TEXT REFERENCES dm_turns(id) ON DELETE SET NULL,
      snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_memory_summaries (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      start_turn_index INTEGER,
      end_turn_index INTEGER,
      summary TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_memory_facts (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'canon',
      fact_key TEXT,
      fact_text TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 100,
      pinned BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `ALTER TABLE dm_memory_facts ADD COLUMN IF NOT EXISTS fact_key TEXT`,
  `CREATE TABLE IF NOT EXISTS dm_memory_embeddings (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      text_chunk TEXT NOT NULL,
      embedding JSONB NOT NULL,
      model TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_llm_calls (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      turn_id TEXT REFERENCES dm_turns(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt JSONB NOT NULL,
      response_text TEXT,
      response_json JSONB,
      latency_ms INTEGER,
      success BOOLEAN NOT NULL,
      error_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_campaign_invites (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      created_by_user_id TEXT NOT NULL REFERENCES dm_users(id) ON DELETE RESTRICT,
      role TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ,
      accepted_by_user_id TEXT REFERENCES dm_users(id) ON DELETE SET NULL,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_world_npcs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES dm_campaigns(id) ON DELETE CASCADE,
      system_id TEXT NOT NULL REFERENCES dm_systems(id) ON DELETE RESTRICT,
      compendium_entry_id TEXT REFERENCES dm_compendium_entries(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      npc_type TEXT NOT NULL DEFAULT 'npc',
      faction TEXT,
      disposition TEXT,
      level INTEGER,
      hp_current INTEGER,
      hp_max INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `CREATE TABLE IF NOT EXISTS dm_auth_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES dm_users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      session_key TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_campaigns_system_id_fkey'
      ) THEN
        ALTER TABLE dm_campaigns
        ADD CONSTRAINT dm_campaigns_system_id_fkey
        FOREIGN KEY (system_id)
        REFERENCES dm_systems(id)
        ON DELETE RESTRICT
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_character_attributes_system_id_fkey'
      ) THEN
        ALTER TABLE dm_character_attributes
        ADD CONSTRAINT dm_character_attributes_system_id_fkey
        FOREIGN KEY (system_id)
        REFERENCES dm_systems(id)
        ON DELETE RESTRICT
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_character_actions_system_id_fkey'
      ) THEN
        ALTER TABLE dm_character_actions
        ADD CONSTRAINT dm_character_actions_system_id_fkey
        FOREIGN KEY (system_id)
        REFERENCES dm_systems(id)
        ON DELETE RESTRICT
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_world_npcs_system_id_fkey'
      ) THEN
        ALTER TABLE dm_world_npcs
        ADD CONSTRAINT dm_world_npcs_system_id_fkey
        FOREIGN KEY (system_id)
        REFERENCES dm_systems(id)
        ON DELETE RESTRICT
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_memberships_role_check'
      ) THEN
        ALTER TABLE dm_memberships
        ADD CONSTRAINT dm_memberships_role_check
        CHECK (role IN ('dm', 'player'))
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_campaigns_status_check'
      ) THEN
        ALTER TABLE dm_campaigns
        ADD CONSTRAINT dm_campaigns_status_check
        CHECK (status IN ('active', 'paused', 'completed', 'archived'))
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_sessions_status_check'
      ) THEN
        ALTER TABLE dm_sessions
        ADD CONSTRAINT dm_sessions_status_check
        CHECK (status IN ('active', 'paused', 'ended'))
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_characters_level_check'
      ) THEN
        ALTER TABLE dm_characters
        ADD CONSTRAINT dm_characters_level_check
        CHECK (level BETWEEN 1 AND 40)
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_characters_hp_max_check'
      ) THEN
        ALTER TABLE dm_characters
        ADD CONSTRAINT dm_characters_hp_max_check
        CHECK (hp_max BETWEEN 1 AND 1000)
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_characters_hp_current_check'
      ) THEN
        ALTER TABLE dm_characters
        ADD CONSTRAINT dm_characters_hp_current_check
        CHECK (hp_current >= 0 AND hp_current <= hp_max)
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_characters_hp_temp_check'
      ) THEN
        ALTER TABLE dm_characters
        ADD CONSTRAINT dm_characters_hp_temp_check
        CHECK (hp_temp BETWEEN 0 AND 1000)
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_inventory_items_quantity_check'
      ) THEN
        ALTER TABLE dm_inventory_items
        ADD CONSTRAINT dm_inventory_items_quantity_check
        CHECK (quantity >= 0)
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_character_attributes_value_check'
      ) THEN
        ALTER TABLE dm_character_attributes
        ADD CONSTRAINT dm_character_attributes_value_check
        CHECK (value_num IS NOT NULL OR value_text IS NOT NULL OR value_json IS NOT NULL)
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_character_actions_uses_check'
      ) THEN
        ALTER TABLE dm_character_actions
        ADD CONSTRAINT dm_character_actions_uses_check
        CHECK (
          (uses_current IS NULL OR uses_current >= 0)
          AND (uses_max IS NULL OR uses_max >= 0)
          AND (uses_max IS NULL OR uses_current IS NULL OR uses_current <= uses_max)
        )
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_quests_status_check'
      ) THEN
        ALTER TABLE dm_quests
        ADD CONSTRAINT dm_quests_status_check
        CHECK (status IN ('active', 'completed', 'failed', 'paused'))
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_quests_progress_check'
      ) THEN
        ALTER TABLE dm_quests
        ADD CONSTRAINT dm_quests_progress_check
        CHECK (progress BETWEEN 0 AND 100)
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_quest_objectives_ord_check'
      ) THEN
        ALTER TABLE dm_quest_objectives
        ADD CONSTRAINT dm_quest_objectives_ord_check
        CHECK (ord >= 0)
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_turns_status_check'
      ) THEN
        ALTER TABLE dm_turns
        ADD CONSTRAINT dm_turns_status_check
        CHECK (status IN ('processing', 'applied', 'failed'))
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_dice_rolls_expression_check'
      ) THEN
        ALTER TABLE dm_dice_rolls
        ADD CONSTRAINT dm_dice_rolls_expression_check
        CHECK (length(btrim(expression)) > 0)
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_dice_rolls_bounds_check'
      ) THEN
        ALTER TABLE dm_dice_rolls
        ADD CONSTRAINT dm_dice_rolls_bounds_check
        CHECK (
          dice_count BETWEEN 1 AND 20
          AND dice_sides IN (4, 6, 8, 10, 12, 20, 100)
          AND modifier BETWEEN -100 AND 100
          AND total BETWEEN -100 AND 2100
        )
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_dice_rolls_outcome_status_check'
      ) THEN
        ALTER TABLE dm_dice_rolls
        ADD CONSTRAINT dm_dice_rolls_outcome_status_check
        CHECK (outcome_status IN ('recorded', 'pending_resolution', 'resolved', 'failed'))
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_state_transitions_transition_type_check'
      ) THEN
        ALTER TABLE dm_state_transitions
        ADD CONSTRAINT dm_state_transitions_transition_type_check
        CHECK (transition_type IN ('set', 'delta', 'append', 'replace', 'create', 'delete'))
        NOT VALID;
      END IF;
    END
    $$`,
  `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dm_state_transitions_field_path_check'
      ) THEN
        ALTER TABLE dm_state_transitions
        ADD CONSTRAINT dm_state_transitions_field_path_check
        CHECK (length(btrim(field_path)) > 0)
        NOT VALID;
      END IF;
    END
    $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dm_turn_unique_campaign_turn ON dm_turns(campaign_id, turn_index)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dm_turn_unique_idempotency ON dm_turns(campaign_id, idempotency_key) WHERE idempotency_key IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dm_dice_roll_idempotency_idx ON dm_dice_rolls(campaign_id, request_idempotency_key) WHERE request_idempotency_key IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dm_compendium_links_unique_relation_idx ON dm_compendium_links(system_id, from_entry_id, to_entry_id, relation_type)`,
  `CREATE INDEX IF NOT EXISTS dm_events_campaign_created_idx ON dm_events(campaign_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS dm_dice_rolls_campaign_created_idx ON dm_dice_rolls(campaign_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS dm_dice_rolls_turn_idx ON dm_dice_rolls(turn_id)`,
  `CREATE INDEX IF NOT EXISTS dm_transitions_campaign_created_idx ON dm_state_transitions(campaign_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS dm_transitions_turn_idx ON dm_state_transitions(turn_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS dm_transitions_entity_idx ON dm_state_transitions(entity_type, entity_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS dm_turns_campaign_created_idx ON dm_turns(campaign_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS dm_embeddings_campaign_created_idx ON dm_memory_embeddings(campaign_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS dm_facts_campaign_updated_idx ON dm_memory_facts(campaign_id, updated_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dm_memory_fact_unique_key ON dm_memory_facts(campaign_id, fact_key) WHERE fact_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS dm_memberships_campaign_role_idx ON dm_memberships(campaign_id, role)`,
  `CREATE INDEX IF NOT EXISTS dm_compendium_lookup_idx ON dm_compendium_entries(system_id, entry_type, name)`,
  `CREATE INDEX IF NOT EXISTS dm_compendium_slug_idx ON dm_compendium_entries(system_id, slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dm_compendium_system_slug_unique_idx ON dm_compendium_entries(system_id, slug)`,
  `CREATE INDEX IF NOT EXISTS dm_character_attr_character_idx ON dm_character_attributes(character_id, attr_key)`,
  `CREATE INDEX IF NOT EXISTS dm_character_action_character_idx ON dm_character_actions(character_id, action_key)`,
  `CREATE INDEX IF NOT EXISTS dm_characters_archetype_entry_idx ON dm_characters(archetype_entry_id)`,
  `CREATE INDEX IF NOT EXISTS dm_inventory_compendium_idx ON dm_inventory_items(compendium_entry_id)`,
  `CREATE INDEX IF NOT EXISTS dm_character_actions_compendium_idx ON dm_character_actions(compendium_entry_id)`,
  `CREATE INDEX IF NOT EXISTS dm_world_npcs_campaign_idx ON dm_world_npcs(campaign_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS dm_auth_events_user_created_idx ON dm_auth_events(user_id, created_at DESC)`
];

const ensureSchemaInternal = async () => {
  if (!connectionString) {
    throw new Error("dm_database_unavailable");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of schemaStatements) {
      await client.query(statement);
    }
    await client.query("SAVEPOINT dm_reference_seed");
    try {
      await seedDmReferenceData(client);
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT dm_reference_seed");
      console.error("DM reference seed failed", error);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const ensureDmSchema = async () => {
  if (!globalForDmDb.dmSchemaPromise) {
    globalForDmDb.dmSchemaPromise = ensureSchemaInternal().catch((error) => {
      // Allow retries on next request if initialization failed during startup races.
      globalForDmDb.dmSchemaPromise = undefined;
      throw error;
    });
  }
  return globalForDmDb.dmSchemaPromise;
};

export const dmQuery = async <T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params: SqlValue[] = []
): Promise<QueryResult<T>> => {
  await ensureDmSchema();
  return pool.query<T>(text, params);
};

export const withDmTransaction = async <T>(
  work: (client: PoolClient) => Promise<T>
): Promise<T> => {
  await ensureDmSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const withCampaignLock = async <T>(campaignId: string, work: (client: PoolClient) => Promise<T>) => {
  await ensureDmSchema();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [campaignId]);
    return await work(client);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [campaignId]);
    } finally {
      client.release();
    }
  }
};

export const toJson = <T>(value: T) => JSON.stringify(value);
