struct ConfigUniforms {
  grid_size: vec2u, // amount of cells
  canvas_size: vec2u, // output canvas size
};

@group(0) @binding(0)
var<uniform> config: ConfigUniforms;

@group(0) @binding(1)
var<storage, read> cell_colors: array<vec3f>;

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

  let grid_x = u32(uv.x * f32(config.grid_size.x));
  let grid_y = u32(uv.y * f32(config.grid_size.y));

  let grid_idx = grid_y * config.grid_size.x + grid_x;

  return vec4f(cell_colors[grid_idx], 1.0);
}
