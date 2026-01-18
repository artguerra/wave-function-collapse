struct ConfigUniforms {
  grid_size: vec2u, // amount of cells
  canvas_size: vec2u, // output canvas size
  tile_size: u32, // size of one tile
  _pad: u32,
};

@group(0) @binding(0)
var<uniform> config: ConfigUniforms;

@group(0) @binding(1)
var<storage, read> cell_colors: array<vec4f>;

// simple vertex shader to display a full-screen quad
@vertex
fn vs(@builtin(vertex_index) vert_idx: u32) -> @builtin(position) vec4f {
  var verts = array<vec2f, 6>(
    vec2f( 1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0, -1.0),
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );

  return vec4f(verts[vert_idx], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) frag_pos: vec4f) -> @location(0) vec4f {
  let uv = frag_pos.xy / vec2f(config.canvas_size);

  let pos_grid_x = uv.x * f32(config.grid_size.x);
  let pos_grid_y = uv.y * f32(config.grid_size.y);

  let grid_x = u32(pos_grid_x);
  let grid_y = u32(pos_grid_y);

  let tile_x = u32((pos_grid_x - f32(grid_x)) * f32(config.tile_size));
  let tile_y = u32((pos_grid_y - f32(grid_y)) * f32(config.tile_size));

  let grid_idx = grid_y * config.grid_size.x + grid_x;
  let tile_px_idx = tile_y * config.tile_size + tile_x;

  let pixels_per_tile = config.tile_size * config.tile_size;
  let mem_offset = grid_idx * pixels_per_tile;

  return vec4f(cell_colors[mem_offset + tile_px_idx].xyz, 1.0);
}
