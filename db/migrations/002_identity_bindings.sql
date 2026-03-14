-- 002_identity_bindings.sql
-- DB-backed identity: wallet ↔ platform mappings + OpenID nonce replay protection.

create table if not exists public.identity_bindings (
  id          bigserial primary key,
  wallet      text      not null,           -- lowercase 0x address
  platform    text      not null,           -- "steam" | "riot" | "epic"
  platform_id text      not null,
  handle      text,
  signed_by   text,                         -- operator address that signed the binding
  signature   text,                         -- EIP-191 personal_sign of the binding JSON
  ts          bigint    not null,           -- unix ms at time of binding
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint identity_bindings_wallet_platform_uq unique (wallet, platform)
);

create index if not exists identity_bindings_wallet_idx
  on public.identity_bindings (wallet);

create index if not exists identity_bindings_platform_id_idx
  on public.identity_bindings (platform, platform_id);

-- OpenID nonce store for replay protection (replaces file-based openid_nonce.json).
-- Nonces expire automatically; a background cleanup or TTL check keeps this lean.
create table if not exists public.openid_nonces (
  id         bigserial   primary key,
  nonce      text        not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists openid_nonces_expires_at_idx
  on public.openid_nonces (expires_at);
