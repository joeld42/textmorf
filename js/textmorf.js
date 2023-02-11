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
    precision mediump float;
        
    uniform vec2 resolution;
    uniform float time;    
    uniform sampler2D u_fonttex;

    uniform vec4 u_glyphRectA; // glyph Rect in screen space
    uniform vec4 u_glyphAtlasA; // glyph STs in atlas

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

      vec2 glyphST_a = vec2( (pos.x - u_glyphRectA.x) / (u_glyphRectA.z - u_glyphRectA.x),
                             (pos.y - u_glyphRectA.y) / (u_glyphRectA.w - u_glyphRectA.y) ) ;
    
      float activeA = min( 1.0-step( glyphST_a.x, 0.0 ), step( glyphST_a.x, 1.0 )) *
                      min( 1.0-step( glyphST_a.y, 0.0 ), step( glyphST_a.y, 1.0 ));

      
      // expand the ST to the atlased ST
      vec2 atlasST_a = vec2( u_glyphAtlasA.x + glyphST_a.x * u_glyphAtlasA.z,
                             u_glyphAtlasA.y + glyphST_a.y * u_glyphAtlasA.w );
      vec4 sdf = texture2D( u_fonttex, atlasST_a );
      float d = 0.66 - sdf.x;      
      float glyphFill = smoothstep( -0.03, 0.03,  -d ) * activeA;
      float glyphStroke = (1.0 - smoothstep( 0.03, 0.05, abs(d) )) * activeA;

      vec4 glyphColor = over( vec4( strokeColor.rgb, strokeColor.a * glyphStroke),
                          vec4( fillColor.rgb, fillColor.a * glyphFill));
                    
       gl_FragColor = glyphColor;
    }
`

const m4 = twgl.m4;
const gl = document.getElementById("textcanvas").getContext("webgl");
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

function drawGlyph( x, y, size, gg, uniforms ) {
    
  uniforms.u_glyphPos = [ x, y, x + size, y + size];
  uniforms.u_glyphRectA = [ x, y, x + size, y + size ];

  uniforms.u_glyphAtlasA = gg.atlas;

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

  let gx = -8 + (Math.sin( time * 0.001) * 3);
  let gy = Math.sin( time * 0.0001) * 2 - 1;  
  
  //drawGlyph( gx, gy, glyphs[69], uniforms ); // H  
  
  const fontsize = 8.0;
  const str = "HELLO\uD83D\uDE00\u0278";
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
        document.getElementById("demo").innerHTML = this.responseText;
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

