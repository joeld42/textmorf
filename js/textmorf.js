var xhttp;
if (window.XMLHttpRequest) {
   xhttp = new XMLHttpRequest();
} else {    // IE 5/6
   xhttp = new ActiveXObject("Microsoft.XMLHTTP");
}


const glyphVertexSource = `
uniform mat4 u_mvp;
uniform vec4 u_glyphPos;  // xy, wh

attribute vec4 position;

varying vec4 pos;

void main() {
  // Use glyphPos uniform to position the quad
  pos = vec4( u_glyphPos.x + position.x * (u_glyphPos.z - u_glyphPos.x),
              u_glyphPos.y + position.y * (u_glyphPos.w - u_glyphPos.y), 
                        position.z, position.w );

  gl_Position = u_mvp * pos;
}
`

const glyphFragmentSource = `
  #extension GL_OES_standard_derivatives : enable

    precision mediump float;
        
    uniform vec2 resolution;
    uniform float time;    
    uniform sampler2D u_fonttex;

    uniform vec4 u_glyphRectA; // glyph Rect in screen space
    uniform vec4 u_glyphAtlasA; // glyph STs in atlas
    uniform float u_glyphBiasA;

    uniform vec4 u_glyphRectB; 
    uniform vec4 u_glyphAtlasB;
    uniform float u_glyphBiasB;

    uniform vec4 fillColor;
    uniform vec4 strokeColor;

    varying vec4 pos;

    // polynomial smooth min
    float smin( float a, float b, float k )
    {
        float h = max( k-abs(a-b), 0.0 )/k;
        return min( a, b ) - h*h*k*(1.0/4.0);
    }

    // "over" compositing
    vec4 over (vec4 source, vec4 backdrop) {
      return vec4( source.rgb * source.a + backdrop.rgb * backdrop.a * (1. - source.a),
                   source.a  + backdrop.a * (1. - source.a));
    }


    

    void main() {

      // A character
      vec2 glyphST_a = vec2( (pos.x - u_glyphRectA.x) / (u_glyphRectA.z - u_glyphRectA.x),
                             (pos.y - u_glyphRectA.y) / (u_glyphRectA.w - u_glyphRectA.y) ) ;
    
      float activeA = min( 1.0-step( glyphST_a.x, 0.0 ), step( glyphST_a.x, 1.0 )) *
                      min( 1.0-step( glyphST_a.y, 0.0 ), step( glyphST_a.y, 1.0 ));
      
      // expand the ST to the atlased ST
      vec2 atlasST_a = vec2( u_glyphAtlasA.x + glyphST_a.x * u_glyphAtlasA.z,
                             u_glyphAtlasA.y + glyphST_a.y * u_glyphAtlasA.w );
      vec4 sdfA = texture2D( u_fonttex, atlasST_a ) * activeA;

      // B character
      vec2 glyphST_b = vec2( (pos.x - u_glyphRectB.x) / (u_glyphRectB.z - u_glyphRectB.x),
                             (pos.y - u_glyphRectB.y) / (u_glyphRectB.w - u_glyphRectB.y) ) ;
    
      float activeB = min( 1.0-step( glyphST_b.x, 0.0 ), step( glyphST_b.x, 1.0 )) *
                      min( 1.0-step( glyphST_b.y, 0.0 ), step( glyphST_b.y, 1.0 ));
      
      // expand the ST to the atlased ST
      vec2 atlasST_b = vec2( u_glyphAtlasB.x + glyphST_b.x * u_glyphAtlasB.z,
                             u_glyphAtlasB.y + glyphST_b.y * u_glyphAtlasB.w );
      vec4 sdfB = texture2D( u_fonttex, atlasST_b ) * activeB;
      
      
      float d = smin( (0.66 + u_glyphBiasA) - sdfA.r, 
                      (0.66 + u_glyphBiasB) - sdfB.r, 0.2 );
      
      float glyphFill = smoothstep( -0.03, 0.03,  -d );
      
      float dd = fwidth(d);
      float glyphStroke = (1.0 - smoothstep( 0.03 -dd, 0.03, abs(d) ));
      //float glyphStroke = (1.0 - smoothstep( 0.03, 0.05, abs(d) ));

      vec4 glyphColor = over( vec4( strokeColor.rgb, strokeColor.a * glyphStroke),
                          vec4( fillColor.rgb, fillColor.a * glyphFill));
                      
       //vec4 bg =  mix( vec4(1,0,0,1), vec4( atlasST_b.x, atlasST_b.y, 0.5, 1.0) , activeB );                          
       gl_FragColor = glyphColor;
    }
`

const m4 = twgl.m4;
const gl = document.getElementById("textcanvas").getContext("webgl");
gl.getExtension("OES_standard_derivatives");

const programInfo = twgl.createProgramInfo(gl, [ glyphVertexSource, glyphFragmentSource ]);
const glyphs = {}
const arrays = {
  //position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
  position: [ 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0],  
};
const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

const textures = twgl.createTextures( gl, { 
      font: {                        
          src: 'fonts/arco_rgb.png',            
          min: gl.LINEAR_MIPMAP_LINEAR,
          min: gl.LINEAR,
          
          crossOrigin: ""            
          }   
      });

// draw a single glyph
function drawGlyph( x, y, size, gg, uniforms ) {
    
  uniforms.u_glyphPos = [ x, y, x + size, y + size];
  uniforms.u_glyphRectA = [ x, y, x + size, y + size ];
  uniforms.u_glyphBiasA = 0.0;
  uniforms.u_glyphAtlasA = gg.atlas;

  uniforms.u_glyphBiasB = 1;

  twgl.setUniforms(programInfo, uniforms);
  twgl.drawBufferInfo(gl, bufferInfo);

}

// draw two morphing glyphs
function drawMorphGlyph( xA, yA, ggA, wA,
                         xB, yB, ggB, wB,
                         size, uniforms ) {
    
  uniforms.u_glyphPos = [ Math.min(xA, xB), 
                          Math.min( yA, yB), 
                          Math.max( xA, xB) + size, 
                          Math.max( yA, yB) + size ];

  uniforms.u_glyphRectA = [ xA, yA, xA + size, yA + size ];
  uniforms.u_glyphRectB = [ xB, yB, xB + size, yB + size ];

  uniforms.u_glyphAtlasA = ggA.atlas;
  uniforms.u_glyphAtlasB = ggB.atlas;

  uniforms.u_glyphBiasA = wA * 0.3;
  uniforms.u_glyphBiasB = wB * 0.3;
  //console.log( "wA wB ", wA, wB );

  twgl.setUniforms(programInfo, uniforms);
  twgl.drawBufferInfo(gl, bufferInfo);

}

function render(time) {
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  
  const uniforms = {
    time: time * 0.0001,
    resolution: [gl.canvas.width, gl.canvas.height],
    u_glyphPos: [ 0, 0, 1, 1],
    u_glyphRectA: [ 0, 0, 1, 1],
    u_glyphAtlasA: [ 0, 0, 1, 1],
    u_fonttex: textures.font,
    fillColor: [ 0,0,1, 0.3 ],
    strokeColor: [ 0.48, 0.15, 0.01, 1 ],
    u_mvp: m4.identity()
  };

  const aspect = gl.canvas.width / gl.canvas.height;
  const worldSize = 8.0; // width in world space of canvas
  const worldScale = 1.0 / worldSize;
  uniforms.u_mvp = m4.scaling( [ worldScale/aspect,worldScale]);

  gl.clearColor(0, 0, 0.1, 0.1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(programInfo.program);
  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
  //twgl.setUniforms(programInfo, uniforms);
  //twgl.drawBufferInfo(gl, bufferInfo);

  // let gx = -8 + (Math.sin( time * 0.001) * 3);
  let gx = -16.0;
  let gy = Math.sin( time * 0.0001) * 2 - 1;  
  
  //drawGlyph( gx, gy, glyphs[69], uniforms ); // H  

  const fontsize = 8.0;
  let blend = (Math.sin( time * 0.001) + 1.0) / 2.0;
  drawMorphGlyph( gx, gy, glyphs[72], blend,
                  gx, gy, glyphs[77], 1.0 - blend,
                  fontsize, uniforms );  
  gx += fontsize  * glyphs[72].advance * 0.8;
  
  const str = "ELLO\uD83D\uDE00\u0278";
  const iterator = str[Symbol.iterator]();
  let theChar = iterator.next();

  while (!theChar.done && theChar.value !== ' ') {
    if (theChar.value.length == 1) {
      let codePoint  = theChar.value.charCodeAt(0);      
      if (codePoint in glyphs) {
        //console.log( glyphs[codePoint]);
        gg = glyphs[codePoint];
        drawGlyph( gx, gy, fontsize, gg, uniforms );
        gx += fontsize  * gg.advance * 0.8;
      } else {
        //console.log("No glyph data for ", codePoint )
      }
    } else {
      // need to convert these to UTF16 or something?
      //console.log("multibyte chars not supported yet");
    }
    theChar = iterator.next();       
  }
  
  


  requestAnimationFrame(render);
}

xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        //document.getElementById("demo").innerHTML = this.responseText;
        var data=this.responseText;
        var jsondata = JSON.parse(data);

        // Store the glyph data in our lookup   
        let atlasResX = jsondata.atlas.width;
        let atlasResY = jsondata.atlas.height
        jsondata.glyphs.forEach( gg => {

          let gr = gg.atlasBounds;
          const charhite = (gr.bottom - gr.top) / atlasResY;
          grect = {            
            "atlas" : [ gr.left / atlasResX, 
                        (1.0 - (gr.top / atlasResY)) - charhite,
                        (gr.right - gr.left) / atlasResX,
                        charhite ],
            "advance" : gg.advance,
          }
          glyphs[ gg.unicode ] = grect;
        });

        /*
        const str = "HELLO\uD83D\uDE00\u0278";
        const iterator = str[Symbol.iterator]();
        let theChar = iterator.next();

        while (!theChar.done && theChar.value !== ' ') {
          console.log(theChar.value, theChar.value.length );
          if (theChar.value.length == 1) {
            let codePoint  = theChar.value.charCodeAt(0);
            console.log( "Codepoint is ", codePoint )
            if (codePoint in glyphs) {
              console.log( glyphs[codePoint]);
            } else {
              console.log("No glyph data for ", codePoint )
            }
          } else {
            // need to convert these to UTF16 or something?
            console.log("multibyte chars not supported yet");
          }
          theChar = iterator.next();          
        }
        */

        // start the render loop
        requestAnimationFrame(render);
    }
};
xhttp.open("GET", "fonts/arco.json", true);
xhttp.send(null);

