import { defineAssets } from '@iwsdk/core';
import { createTable, createKit, createNeighbourhood, createOperator } from './scene-assets/ant.scene-asset.js';
export default defineAssets({ table: createTable(), kit: createKit(), neighbourhood: createNeighbourhood(), operator: createOperator() });
