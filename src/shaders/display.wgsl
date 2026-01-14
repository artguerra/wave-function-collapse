@vertex fn vs(
  @builtin(vertex_index) vert_idx: u32
) -> @builtin(position) vec4f {
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

@fragment fn fs(
  @builtin(position) fragPos: vec4f
) -> @location(0) vec4f {
  return vec4f(1.0, 0.0, 0.0, 1.0);
}
