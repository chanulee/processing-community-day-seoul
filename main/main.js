// Entry for index.html: the main poster, Two Shapes, on its own.
import twoShapes from './two-shapes.js';

window.LAB = { experiments: [twoShapes] };
await import('../app/shell.js');
