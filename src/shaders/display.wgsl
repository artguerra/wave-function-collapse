struct ConfigUniforms {
  grid_size: vec2u, // amount of cells
  canvas_size: vec2u, // output canvas size
  tile_size: u32, // size of one tile
  _pad: u32,
  pan_offset: vec2f, // camera panning
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

  let pos_grid_x = uv.x * f32(config.grid_size.x) - config.pan_offset.x;
  let pos_grid_y = uv.y * f32(config.grid_size.y) - config.pan_offset.y;

  let ix = i32(floor(pos_grid_x));
  let iy = i32(floor(pos_grid_y));
  let isize = vec2i(config.grid_size);

  let grid_x = ((ix % isize.x) + isize.x) % isize.x;
  let grid_y = ((iy % isize.y) + isize.y) % isize.y;

  let grid_idx = grid_y * isize.x + grid_x;

  return vec4f(cell_colors[grid_idx].xyz, 1.0);
}
