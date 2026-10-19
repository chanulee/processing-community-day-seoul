class HoopMesh {
  constructor(circle, segments, splitHalves, flatHalves) {
    this.shader = createShader(`
      precision highp float;
      attribute vec3 aPosition;
      attribute vec2 aTexCoord;
      uniform mat4 uModelViewMatrix;
      uniform mat4 uProjectionMatrix;
      uniform vec4 uBandDimensions; // top radius, bottom radius, top z, bottom z
      uniform vec4 uBandMotion; // shear, repeats, scroll, U direction
      uniform bool uIsCap;
      varying vec2 vTexCoord;
      void main() {
        vec3 position;
        if (uIsCap) {
          position = vec3(aPosition.xy * uBandDimensions.x, uBandDimensions.z);
          vTexCoord = aTexCoord;
        } else {
          float radius = mix(uBandDimensions.y, uBandDimensions.x, aTexCoord.y);
          float z = mix(uBandDimensions.w, uBandDimensions.z, aTexCoord.y);
          position = vec3(aPosition.xy * radius, z + aPosition.z * uBandMotion.x);
          vTexCoord = vec2(uBandMotion.w * (aTexCoord.x * uBandMotion.y + uBandMotion.z), aTexCoord.y);
        }
        gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(position, 1.0);
      }
    `, `
      precision highp float;
      uniform sampler2D uSampler;
      uniform bool isTexture;
      uniform vec4 uTint;
      uniform vec4 uMaterialColor;
      varying vec2 vTexCoord;
      void main() {
        // Match p5's premultiplied-alpha texture and fill output.
        gl_FragColor = isTexture
          ? texture2D(uSampler, vTexCoord) * vec4(uTint.rgb / 255.0, 1.0) * (uTint.a / 255.0)
          : vec4(uMaterialColor.rgb * uMaterialColor.a, uMaterialColor.a);
      }
    `);

    // Band z stores a shear coefficient; the shader computes the final position.
    const band = (halves) => buildGeometry(() => {
      noStroke();
      fill(255);
      textureMode(NORMAL);
      for (const [pa, pb, zo] of halves) {
        beginShape(TRIANGLE_STRIP);
        for (let p = pa; p <= pb; p++) {
          const { x, y } = circle[p];
          const gt = p / segments;
          const z = gt + SEAM_ANGLE / TWO_PI + zo;
          vertex(x, y, z, gt, 1);
          vertex(x, y, z, gt, 0);
        }
        endShape();
      }
    });
    this.flat = band(flatHalves);
    this.split = band(splitHalves);
    this.cap = buildGeometry(() => {
      noStroke();
      fill(255);
      textureMode(NORMAL);
      beginShape(TRIANGLE_FAN);
      vertex(0, 0, 0, 0.5, 0.5);
      for (let p = 0; p <= segments; p++) {
        const { capX: x, capY: y } = circle[p];
        vertex(x, y, 0, 0.5 + x * 0.5, 0.5 + y * 0.5);
      }
      endShape();
    });
  }

  band(radiusTop, radiusBot, top, bot, shear, reps, scroll, direction, split = false) {
    shader(this.shader);
    this.shader.setUniform("uIsCap", false);
    this.shader.setUniform("uBandDimensions", [radiusTop, radiusBot, top, bot]);
    this.shader.setUniform("uBandMotion", [shear, reps, scroll, direction]);
    model(split ? this.split : this.flat);
  }

  disk(radius, z) {
    shader(this.shader);
    this.shader.setUniform("uIsCap", true);
    this.shader.setUniform("uBandDimensions", [radius, radius, z, z]);
    model(this.cap);
  }
}
