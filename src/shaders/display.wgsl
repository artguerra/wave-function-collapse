struct ConfigUniforms {
  canvas_size: vec2u, // output canvas size
  pan_offset: vec2f, // camera panning
};

@group(0) @binding(0)
var<uniform> config: ConfigUniforms;

@group(0) @binding(1)
var wave_texture: texture_2d<f32>;

@group(0) @binding(2)
var wave_sampler: sampler;

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
  let pan_uv = config.pan_offset / vec2f(config.canvas_size);

  let scrolled_uv = uv - pan_uv;
  let wrapped_uv = fract(scrolled_uv);

  return textureSample(wave_texture, wave_sampler, wrapped_uv);
}
