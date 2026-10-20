// Entry for lab.html: every experiment, browsable side by side.
import typeFill from '../experiments/01-type-fill.js';
import splatField from '../experiments/05-splat-field.js';
import gravityLetters from '../experiments/07-gravity-letters.js';
import waveType from '../experiments/08-wave-type.js';
import pretextFlow from '../experiments/09-pretext-flow.js';
import cycloidPen from '../experiments/11-cycloid-pen.js';
import letterCube from '../experiments/12-letter-cube.js';
import life1970 from '../experiments/13-life-1970.js';
import ikPlotter from '../experiments/14-ik-plotter.js';
import kdTree from '../experiments/15-kd-tree.js';
import reactionDiffusion from '../experiments/16-reaction-diffusion.js';
import voronoi from '../experiments/17-voronoi.js';
import marchingSquares from '../experiments/18-marching-squares.js';
import anamorphic from '../experiments/19-anamorphic.js';

window.LAB = {
  experiments: [typeFill, splatField, gravityLetters, waveType, pretextFlow, cycloidPen, letterCube, life1970, ikPlotter, kdTree, reactionDiffusion, voronoi, marchingSquares, anamorphic],
};
await import('./shell.js');
