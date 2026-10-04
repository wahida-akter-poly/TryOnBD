import {defaultShirtCalibration} from '../../src/data/shirtProducts.js';
import {structuredSourceLandmarks} from '../../src/data/structuredShirtCalibration.js';
export const shirtPreviewProduct = Object.freeze({
  id: 'tshirt-preview',
  name: 'Black T-Shirt · AR preview',
  tryOnType: 'CLOTHING',
  arType: 'tshirt',
  previewOnly: true,
  stockQuantity: 0,
  shirtAR: Object.freeze({
    ...defaultShirtCalibration,
    // Working PNG calibration only; commercial product authenticity remains
    // unconfirmed. Coordinates are relative to measured visible alpha bounds.
    sourceLandmarks: structuredSourceLandmarks,
  }),
});
