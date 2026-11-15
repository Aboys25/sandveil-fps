// SANDVEIL — the look plan in one place. A freight depot at dusk: warm sand and rust
// against a cold steel-blue dusk, one amber accent. No other colour appears in the code.
export const PALETTE = {
  canvas: '#16120e', // UI background, dusk ground haze
  surface: '#2b241b', // walls, dark concrete
  hairline: '#4a3d2c', // trim, crates, dark metal
  ink: '#f2e8d5', // paper, HUD text, light concrete
  muted: '#a2937a', // secondary text, weathered metal
  accent: '#ffb347', // amber: lamps, markers, muzzle light
  sand: '#c9a86a', // ground, sandbags
  rust: '#8c4a2f', // containers, barrels
  teal: '#3f7d7a', // containers, pipes
  olive: '#6b7040', // crates, tarps
  concrete: '#7d7468', // floors, barriers
  atk: '#e4572e', // attacking side: ember (side colours follow the side, not the squad)
  def: '#3fa7d6', // defending side: steel blue
  danger: '#e5484d', // damage, bomb light
  smoke: '#b8b0a0', // smoke grenade
};

// Squad names: the two squads persist across the halftime side swap. Vanguard is
// always the player's squad (you + Rook, Havoc, Sable, Fenn) and Sentinels the
// foe squad (Nomad, Vex, Onyx, Bram, Kite), whichever side either plays. Scores
// and the final result are tracked by squad, never by side.
export const TEAM_NAMES = { squad: 'Vanguard', foe: 'Sentinels' };
