import { readFile } from 'node:fs/promises';
import {
  expect,
  test,
  type Download,
  type Locator,
  type Page,
} from '@playwright/test';

const anchorPositions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

const artifactNodes = (page: Page) =>
  page.locator('[data-testid^="artifact-node-"]');

const relationEdges = (page: Page) =>
  page.locator('[data-testid^="relation-edge-"]');

interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

interface ViewportModel {
  artifacts: unknown[];
  layout: {
    processViews: Array<{
      processId: string;
      artifactPlacements: unknown[];
      subprocessColumns: unknown[];
      viewport: CanvasViewport;
    }>;
    overview: {
      nodes: unknown[];
      viewport: CanvasViewport;
    };
  };
}

interface ResizableModel {
  schemaVersion: string;
  processActorLanes: Array<{
    id: string;
    processId: string;
    actorId: string;
    order: number;
    height: number;
  }>;
  artifacts: Array<{
    id: string;
    processId?: string;
    responsibleActorId?: string;
  }>;
  relations: Array<{
    id: string;
    sourceAnchor: string;
    targetAnchor: string;
  }>;
  layout: {
    processViews: Array<{
      processId: string;
      artifactPlacements: unknown[];
      subprocessColumns: Array<{
        processId: string;
        width: number;
        height?: number;
      }>;
    }>;
  };
}

const MLC_PROCESS_ID = 'process-mlc-test-design';
const GENERATION_PROCESS_ID = 'process-mlc-test-case-generation';
const EVALUATION_PROCESS_ID = 'process-mlc-evaluation-handover';
const RESEARCH_LEAD_LANE_ID = 'lane-mlc-research-lead';

function mlcLanes(model: ResizableModel) {
  const lanes = model.processActorLanes
    .filter((lane) => lane.processId === MLC_PROCESS_ID)
    .sort((left, right) => left.order - right.order);
  if (lanes.length !== 3 || lanes[0].id !== RESEARCH_LEAD_LANE_ID) {
    throw new Error('テンプレートのアクターレーンがありません');
  }
  return lanes;
}

function mlcColumns(model: ResizableModel) {
  const view = model.layout.processViews.find(
    (item) => item.processId === MLC_PROCESS_ID,
  );
  if (!view) throw new Error('テンプレートのプロセス詳細がありません');
  const generation = view.subprocessColumns.find(
    (item) => item.processId === GENERATION_PROCESS_ID,
  );
  const evaluation = view.subprocessColumns.find(
    (item) => item.processId === EVALUATION_PROCESS_ID,
  );
  if (!generation || !evaluation) {
    throw new Error('テンプレートのサブプロセス列がありません');
  }
  return { view, generation, evaluation };
}

test.use({ viewport: { width: 1_600, height: 1_000 } });

async function loadTemplate(page: Page, testId: string) {
  await page.getByTestId(testId).click();
}

async function readDownloadedJson<T>(download: Download): Promise<T> {
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('ダウンロードしたJSONのパスを取得できませんでした');
  return JSON.parse(await readFile(downloadedPath, 'utf8')) as T;
}

async function downloadCurrentModel<T>(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save-json').click();
  const download = await downloadPromise;
  return {
    download,
    model: await readDownloadedJson<T>(download),
  };
}

async function readCanvasViewport(canvas: Locator): Promise<CanvasViewport> {
  return canvas.locator('.react-flow__viewport').evaluate((element) => {
    const transform = window.getComputedStyle(element).transform;
    const matrix =
      transform === 'none'
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(transform);
    return { x: matrix.m41, y: matrix.m42, zoom: matrix.a };
  });
}

async function wheelOver(
  page: Page,
  target: Locator,
  deltaX: number,
  deltaY: number,
) {
  const box = await target.boundingBox();
  if (!box) throw new Error('ホイール操作の対象位置を取得できませんでした');
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + box.height / 2,
  );
  await page.mouse.wheel(deltaX, deltaY);
}

async function makePageScrollable(page: Page) {
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.position = 'absolute';
    spacer.style.inset = '0 auto auto 0';
    spacer.style.width = `${window.innerWidth + 400}px`;
    spacer.style.height = `${window.innerHeight + 400}px`;
    spacer.style.pointerEvents = 'none';
    document.body.append(spacer);
    window.scrollTo({ left: 24, top: 24, behavior: 'instant' });
  });
  await expect
    .poll(() => page.evaluate(() => window.scrollX > 0 && window.scrollY > 0))
    .toBe(true);
}

async function expectViewportRestored(
  canvas: Locator,
  expected: CanvasViewport,
) {
  await expect
    .poll(async () => {
      const current = await readCanvasViewport(canvas);
      return (
        Math.abs(current.x - expected.x) < 0.5 &&
        Math.abs(current.y - expected.y) < 0.5 &&
        Math.abs(current.zoom - expected.zoom) < 0.01
      );
    })
    .toBe(true);
}

async function connectHandles(
  page: Page,
  sourceHandle: Locator,
  targetHandle: Locator,
) {
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('接続点の画面上の位置を取得できませんでした');
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
}

async function dragResizeHandle(
  page: Page,
  handle: Locator,
  deltaX: number,
  deltaY: number,
) {
  await handle.click({ trial: true });
  const box = await handle.boundingBox();
  if (!box) throw new Error('リサイズハンドルの位置を取得できませんでした');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 12 });
  await page.mouse.up();
}

async function selectGenerationSubprocess(page: Page) {
  await page
    .getByTestId('process-grid')
    .locator('.process-grid-node__column-select')
    .filter({ hasText: 'テストケース生成' })
    .click();
  await expect(
    page.getByTestId(`subprocess-box-${GENERATION_PROCESS_ID}`),
  ).toBeVisible();
}

async function selectResearchLeadLane(page: Page) {
  await page
    .getByTestId('process-grid')
    .locator('.process-grid-node__lane-header')
    .first()
    .click();
  await expect(page.getByTestId('actor-lane-height-input')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });

  await page.goto('/');
  await expect(page.getByTestId('process-canvas')).toBeVisible();
});

test('初期表示は空のプロセス詳細と責任グリッドの準備案内を表示する', async ({
  page,
}) => {
  const metrics = page.getByLabel('モデル要素数');

  await expect(metrics).toContainText('1 プロセス');
  await expect(metrics).toContainText('0 成果物');
  await expect(metrics).toContainText('0 関係');
  await expect(artifactNodes(page)).toHaveCount(0);
  await expect(page.getByTestId('process-grid')).toHaveCount(0);
  await expect(
    page.getByText('責任グリッドを準備してください', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/左のパレットからアクターを追加してください/),
  ).toBeVisible();
  await expect(
    page.getByText(/サブプロセスを1つ以上追加してください/),
  ).toBeVisible();
});

test('小さな画面で縦横にスクロールできる', async ({ page }) => {
  await page.setViewportSize({ width: 1_000, height: 560 });

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);

  await page.evaluate(() => {
    window.scrollTo({
      left: document.documentElement.scrollWidth,
      top: document.documentElement.scrollHeight,
      behavior: 'instant',
    });
  });
  await expect
    .poll(() => page.evaluate(() => window.scrollX > 0 && window.scrollY > 0))
    .toBe(true);

  await page.evaluate(() => window.scrollTo({ left: 0, top: 0 }));
  await expect(page.getByTestId('process-canvas')).toBeVisible();
  await expect(page.getByTestId('add-actor')).toBeVisible();
});

test('プロセス詳細は二本指相当の縦横入力でパンし、配置とビューポートを個別に保存する', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');

  const canvas = page.getByTestId('process-canvas');
  const artifact = page.getByTestId(
    'artifact-node-artifact-reliability-requirements',
  );
  await artifact.click();
  await expect(artifact).toHaveClass(/is-selected/);

  const before = await downloadCurrentModel<ViewportModel>(page);
  await makePageScrollable(page);
  const beforeViewport = await readCanvasViewport(canvas);
  const beforeNodeStyle = await artifact.evaluate((element) =>
    element.closest('.react-flow__node')?.getAttribute('style'),
  );
  const beforeScroll = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  await wheelOver(page, artifact, 160, 120);
  await expect
    .poll(async () => {
      const current = await readCanvasViewport(canvas);
      return (
        Math.abs(current.x - beforeViewport.x) > 2 &&
        Math.abs(current.y - beforeViewport.y) > 2
      );
    })
    .toBe(true);

  const pannedViewport = await readCanvasViewport(canvas);
  expect(pannedViewport.zoom).toBeCloseTo(beforeViewport.zoom, 4);
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(
    beforeScroll,
  );
  expect(
    await artifact.evaluate((element) =>
      element.closest('.react-flow__node')?.getAttribute('style'),
    ),
  ).toBe(beforeNodeStyle);
  await expect(artifact).toHaveClass(/is-selected/);

  await page.keyboard.down('Control');
  await wheelOver(page, artifact, 0, -100);
  await page.keyboard.up('Control');
  await expect
    .poll(async () => (await readCanvasViewport(canvas)).zoom)
    .not.toBeCloseTo(pannedViewport.zoom, 2);

  await page.waitForTimeout(250);
  const after = await downloadCurrentModel<ViewportModel>(page);
  const processId = 'process-mlc-test-design';
  const beforeView = before.model.layout.processViews.find(
    (view) => view.processId === processId,
  );
  const afterView = after.model.layout.processViews.find(
    (view) => view.processId === processId,
  );
  expect(beforeView).toBeDefined();
  expect(afterView).toBeDefined();
  expect(after.model.artifacts).toEqual(before.model.artifacts);
  expect(afterView?.artifactPlacements).toEqual(
    beforeView?.artifactPlacements,
  );
  expect(afterView?.subprocessColumns).toEqual(beforeView?.subprocessColumns);
  expect(afterView?.viewport.x).not.toBe(beforeView?.viewport.x);
  expect(afterView?.viewport.y).not.toBe(beforeView?.viewport.y);

  const savedPath = await after.download.path();
  if (!savedPath) throw new Error('保存したJSONのパスを取得できませんでした');
  await page.getByRole('button', { name: '鳥瞰図', exact: true }).click();
  await expect(page.getByTestId('overview-canvas')).toBeVisible();
  await page.getByLabel('PRePモデルJSONを読み込む').setInputFiles(savedPath);
  await expect(page.getByTestId('process-canvas')).toBeVisible();
  await expectViewportRestored(
    page.getByTestId('process-canvas'),
    afterView!.viewport,
  );
});

test('鳥瞰図も二本指相当の縦横入力でパンし、ノードとページを移動しない', async ({
  page,
}) => {
  await loadTemplate(page, 'template-coffee');

  const canvas = page.getByTestId('overview-canvas');
  const processNode = page.getByTestId(
    'overview-process-process-brew-coffee',
  );
  await processNode.click();
  const before = await downloadCurrentModel<ViewportModel>(page);
  await makePageScrollable(page);
  const beforeViewport = await readCanvasViewport(canvas);
  const beforeNodeStyle = await processNode.evaluate((element) =>
    element.closest('.react-flow__node')?.getAttribute('style'),
  );
  const beforeScroll = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  await wheelOver(page, processNode, -140, 110);
  await expect
    .poll(async () => {
      const current = await readCanvasViewport(canvas);
      return (
        Math.abs(current.x - beforeViewport.x) > 2 &&
        Math.abs(current.y - beforeViewport.y) > 2
      );
    })
    .toBe(true);

  const pannedViewport = await readCanvasViewport(canvas);
  expect(pannedViewport.zoom).toBeCloseTo(beforeViewport.zoom, 4);
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(
    beforeScroll,
  );
  expect(
    await processNode.evaluate((element) =>
      element.closest('.react-flow__node')?.getAttribute('style'),
    ),
  ).toBe(beforeNodeStyle);

  await page.waitForTimeout(250);
  const after = await downloadCurrentModel<ViewportModel>(page);
  expect(after.model.layout.overview.nodes).toEqual(
    before.model.layout.overview.nodes,
  );
  expect(after.model.artifacts).toEqual(before.model.artifacts);
  expect(after.model.layout.overview.viewport.x).not.toBe(
    before.model.layout.overview.viewport.x,
  );
  expect(after.model.layout.overview.viewport.y).not.toBe(
    before.model.layout.overview.viewport.y,
  );

  const savedPath = await after.download.path();
  if (!savedPath) throw new Error('保存したJSONのパスを取得できませんでした');
  await processNode.dblclick();
  await expect(page.getByTestId('process-canvas')).toBeVisible();
  await page.getByLabel('PRePモデルJSONを読み込む').setInputFiles(savedPath);
  await expect(page.getByTestId('overview-canvas')).toBeVisible();
  await expectViewportRestored(
    page.getByTestId('overview-canvas'),
    after.model.layout.overview.viewport,
  );
});

test('制約付き多ラベル分類テンプレートは3レーン・2列に8成果物と8関係を読み込む', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');

  const grid = page.getByTestId('process-grid');
  await expect(grid).toBeVisible();
  await expect(grid.locator('.process-grid-node__lane-header')).toHaveCount(3);
  await expect(grid.locator('.process-grid-node__column-header')).toHaveCount(2);
  await expect(grid.getByText('研究責任者', { exact: true })).toBeVisible();
  await expect(grid.getByText('テストケース生成', { exact: true })).toBeVisible();
  await expect(grid.getByText('評価・引継ぎ', { exact: true })).toBeVisible();

  await expect(artifactNodes(page)).toHaveCount(8);
  await expect(relationEdges(page)).toHaveCount(8);
  await expect(page.getByLabel('モデル要素数')).toContainText('3 プロセス');
  await expect(page.getByLabel('モデル要素数')).toContainText('8 成果物');
  await expect(page.getByLabel('モデル要素数')).toContainText('8 関係');
  await expect(
    page.getByTestId('artifact-node-artifact-reliability-requirements'),
  ).toContainText('信頼性要求');
  await expect(
    page.getByTestId('artifact-node-artifact-handover-conditions'),
  ).toContainText('引継ぎ条件');
});

test('サブプロセス範囲ボックスは右辺・下辺・右下角で独立にリサイズでき、1回のドラッグをUndoできる', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');
  await selectGenerationSubprocess(page);

  const before = (await downloadCurrentModel<ResizableModel>(page)).model;
  const initial = mlcColumns(before);
  expect(initial.generation.width).toBe(500);
  expect(initial.generation.height).toBeUndefined();
  const evaluationBox = page.getByTestId(
    `subprocess-box-${EVALUATION_PROCESS_ID}`,
  );
  const evaluationBefore = await evaluationBox.boundingBox();
  if (!evaluationBefore) throw new Error('後続列の位置を取得できませんでした');
  const right = page.getByTestId(
    `subprocess-resize-right-${GENERATION_PROCESS_ID}`,
  );
  const bottom = page.getByTestId(
    `subprocess-resize-bottom-${GENERATION_PROCESS_ID}`,
  );
  const corner = page.getByTestId(
    `subprocess-resize-corner-${GENERATION_PROCESS_ID}`,
  );
  await expect(right).toBeVisible();
  await expect(bottom).toBeVisible();
  await expect(corner).toBeVisible();

  await dragResizeHandle(page, right, 90, 0);
  const afterRight = (await downloadCurrentModel<ResizableModel>(page)).model;
  const rightColumns = mlcColumns(afterRight);
  expect(rightColumns.generation.width).toBeGreaterThan(initial.generation.width);
  expect(rightColumns.generation.height).toBeUndefined();
  expect(rightColumns.evaluation).toEqual(initial.evaluation);
  const evaluationAfter = await evaluationBox.boundingBox();
  if (!evaluationAfter) throw new Error('リサイズ後の後続列の位置を取得できませんでした');
  expect(evaluationAfter.x).toBeGreaterThan(evaluationBefore.x);

  await dragResizeHandle(page, bottom, 0, 90);
  const afterBottom = (await downloadCurrentModel<ResizableModel>(page)).model;
  const bottomColumns = mlcColumns(afterBottom);
  expect(bottomColumns.generation.width).toBe(rightColumns.generation.width);
  expect(bottomColumns.generation.height).toBeGreaterThan(660);
  expect(bottomColumns.evaluation).toEqual(initial.evaluation);

  await dragResizeHandle(page, corner, 70, 70);
  const afterCorner = (await downloadCurrentModel<ResizableModel>(page)).model;
  const cornerColumns = mlcColumns(afterCorner);
  expect(cornerColumns.generation.width).toBeGreaterThan(
    bottomColumns.generation.width,
  );
  expect(cornerColumns.generation.height).toBeGreaterThan(
    bottomColumns.generation.height!,
  );
  expect(cornerColumns.evaluation).toEqual(initial.evaluation);
  expect(afterCorner.artifacts).toEqual(before.artifacts);
  expect(afterCorner.relations).toEqual(before.relations);
  expect(cornerColumns.view.artifactPlacements).toEqual(
    initial.view.artifactPlacements,
  );

  await page.getByRole('button', { name: '元に戻す' }).click();
  const afterUndo = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(mlcColumns(afterUndo).generation).toEqual(bottomColumns.generation);
});

test('列の数値入力は成果物の外周を越えて縮小せず、手動高さとauto高さをJSONで復元できる', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');
  await selectGenerationSubprocess(page);
  const before = (await downloadCurrentModel<ResizableModel>(page)).model;
  const widthInput = page.getByTestId('subprocess-width-input');
  const heightInput = page.getByTestId('subprocess-height-input');

  await widthInput.fill('600');
  await widthInput.press('Tab');
  await heightInput.fill('800');
  await heightInput.press('Tab');
  const expanded = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(mlcColumns(expanded).generation).toMatchObject({
    width: 600,
    height: 800,
  });

  await widthInput.fill('260');
  await widthInput.press('Tab');
  await heightInput.fill('160');
  await heightInput.press('Tab');
  const clampedSave = await downloadCurrentModel<ResizableModel>(page);
  const clamped = mlcColumns(clampedSave.model);
  // 最も右の成果物は左端から240px、幅200px、余白24pxを必要とする。
  expect(clamped.generation.width).toBeGreaterThanOrEqual(464);
  // この列の最下段は2番目のレーンで、220+24+116+24pxを必要とする。
  expect(clamped.generation.height).toBeGreaterThanOrEqual(384);
  expect(clamped.generation.width).toBeLessThan(600);
  expect(clamped.generation.height).toBeLessThan(800);
  expect(clamped.evaluation.height).toBeUndefined();
  expect(clampedSave.model.artifacts).toEqual(before.artifacts);
  expect(clampedSave.model.relations).toEqual(before.relations);
  expect(clamped.view.artifactPlacements).toEqual(
    mlcColumns(before).view.artifactPlacements,
  );

  const savedPath = await clampedSave.download.path();
  if (!savedPath) throw new Error('保存したJSONのパスを取得できませんでした');
  await page.getByTestId('new-model').click();
  await page.getByLabel('PRePモデルJSONを読み込む').setInputFiles(savedPath);
  await expect(page.getByTestId('process-grid')).toBeVisible();
  const restored = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(mlcColumns(restored).generation).toEqual(clamped.generation);
  expect(mlcColumns(restored).evaluation.height).toBeUndefined();

  await selectGenerationSubprocess(page);
  await page.getByTestId('subprocess-height-auto').click();
  const afterAuto = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(mlcColumns(afterAuto).generation.height).toBeUndefined();
  expect(mlcColumns(afterAuto).evaluation.height).toBeUndefined();

  const autoBox = page.getByTestId(`subprocess-box-${GENERATION_PROCESS_ID}`);
  const autoBoxBefore = await autoBox.boundingBox();
  if (!autoBoxBefore) throw new Error('自動高さの範囲ボックスを取得できませんでした');
  await page.getByTestId('process-grid').locator('.process-grid-node__lane-header').first().click();
  const laneHeightInput = page.getByTestId('actor-lane-height-input');
  await laneHeightInput.fill('300');
  await laneHeightInput.press('Tab');
  const autoBoxAfter = await autoBox.boundingBox();
  if (!autoBoxAfter) throw new Error('レーン変更後の範囲ボックスを取得できませんでした');
  expect(autoBoxAfter.height).toBeGreaterThan(autoBoxBefore.height);
  const afterLaneChange = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(mlcColumns(afterLaneChange).generation.height).toBeUndefined();
});

test('アクタースイムレーンの下辺ドラッグは高さとauto列を伸ばし、1回のUndoで元に戻る', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');
  const before = (await downloadCurrentModel<ResizableModel>(page)).model;
  const initialLanes = mlcLanes(before);
  expect(initialLanes[0].height).toBe(220);

  const autoBox = page.getByTestId(`subprocess-box-${GENERATION_PROCESS_ID}`);
  const autoBoxBefore = await autoBox.boundingBox();
  const secondLaneHeader = page
    .getByTestId('process-grid')
    .locator('.process-grid-node__lane-header')
    .nth(1);
  const secondLaneBefore = await secondLaneHeader.boundingBox();
  if (!autoBoxBefore || !secondLaneBefore) {
    throw new Error('リサイズ前の範囲ボックスとレーン位置を取得できませんでした');
  }

  await selectResearchLeadLane(page);
  const bottom = page.getByTestId(
    `actor-lane-resize-bottom-${RESEARCH_LEAD_LANE_ID}`,
  );
  await expect(bottom).toBeVisible();
  await dragResizeHandle(page, bottom, 0, 90);

  const after = (await downloadCurrentModel<ResizableModel>(page)).model;
  const resizedLanes = mlcLanes(after);
  expect(resizedLanes[0].height).toBeGreaterThan(initialLanes[0].height);
  expect(resizedLanes.slice(1)).toEqual(initialLanes.slice(1));
  expect(mlcColumns(after).view.subprocessColumns).toEqual(
    mlcColumns(before).view.subprocessColumns,
  );
  expect(after.artifacts).toEqual(before.artifacts);
  expect(after.relations).toEqual(before.relations);
  expect(mlcColumns(after).view.artifactPlacements).toEqual(
    mlcColumns(before).view.artifactPlacements,
  );

  const autoBoxAfter = await autoBox.boundingBox();
  const secondLaneAfter = await secondLaneHeader.boundingBox();
  if (!autoBoxAfter || !secondLaneAfter) {
    throw new Error('リサイズ後の範囲ボックスとレーン位置を取得できませんでした');
  }
  expect(autoBoxAfter.height).toBeGreaterThan(autoBoxBefore.height);
  expect(secondLaneAfter.y).toBeGreaterThan(secondLaneBefore.y);

  await page.getByRole('button', { name: '元に戻す' }).click();
  const undone = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(mlcLanes(undone)).toEqual(initialLanes);
  expect(mlcColumns(undone).view.subprocessColumns).toEqual(
    mlcColumns(before).view.subprocessColumns,
  );
});

test('レーン高さの数値入力は成果物を押し出さず、手動列高さと独立に保存・復元できる', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');
  const before = (await downloadCurrentModel<ResizableModel>(page)).model;
  await selectGenerationSubprocess(page);
  const columnHeight = page.getByTestId('subprocess-height-input');
  await columnHeight.fill('800');
  await columnHeight.press('Tab');
  await selectResearchLeadLane(page);

  const laneHeight = page.getByTestId('actor-lane-height-input');
  await laneHeight.fill('320');
  await laneHeight.press('Tab');
  const expanded = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(mlcLanes(expanded)[0].height).toBe(320);
  expect(mlcColumns(expanded).generation.height).toBe(800);
  expect(mlcColumns(expanded).evaluation.height).toBeUndefined();

  await laneHeight.fill('160');
  await laneHeight.press('Tab');
  const saved = await downloadCurrentModel<ResizableModel>(page);
  const clampedLane = mlcLanes(saved.model)[0];
  // このレーン内の成果物は上端24px＋高さ116px＋下側余白24pxが必要。
  expect(clampedLane.height).toBeGreaterThanOrEqual(164);
  expect(clampedLane.height).toBeLessThan(320);
  expect(mlcColumns(saved.model).generation.height).toBe(800);
  expect(mlcColumns(saved.model).evaluation.height).toBeUndefined();
  expect(saved.model.artifacts).toEqual(before.artifacts);
  expect(saved.model.relations).toEqual(before.relations);
  expect(mlcColumns(saved.model).view.artifactPlacements).toEqual(
    mlcColumns(before).view.artifactPlacements,
  );

  const savedPath = await saved.download.path();
  if (!savedPath) throw new Error('保存したJSONのパスを取得できませんでした');
  await page.getByTestId('new-model').click();
  await page.getByLabel('PRePモデルJSONを読み込む').setInputFiles(savedPath);
  await expect(page.getByTestId('process-grid')).toBeVisible();
  const restored = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(mlcLanes(restored)).toEqual(mlcLanes(saved.model));
  expect(mlcColumns(restored).view.subprocessColumns).toEqual(
    mlcColumns(saved.model).view.subprocessColumns,
  );
});

test('保存済みレーンがないモデルでも初回ドラッグを最後まで続けられ、保存とUndoができる', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');
  const template = (await downloadCurrentModel<ResizableModel>(page)).model;
  const actorId = mlcLanes(template)[0].actorId;
  const derivedLaneId = `derived-lane:${MLC_PROCESS_ID}:${actorId}`;

  await page.getByLabel('PRePモデルJSONを読み込む').setInputFiles({
    name: 'derived-lanes.prep.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      ...template,
      processActorLanes: [],
    })),
  });
  await expect(
    page.getByTestId('process-grid').locator('.process-grid-node__lane-header'),
  ).toHaveCount(3);
  const before = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(before.processActorLanes).toEqual([]);
  const zoom = (await readCanvasViewport(page.getByTestId('process-canvas'))).zoom;

  await selectResearchLeadLane(page);
  const handle = page.getByTestId(
    `actor-lane-resize-bottom-${derivedLaneId}`,
  );
  await dragResizeHandle(page, handle, 0, 90);
  const after = (await downloadCurrentModel<ResizableModel>(page)).model;
  const savedLanes = after.processActorLanes
    .filter((lane) => lane.processId === MLC_PROCESS_ID)
    .sort((left, right) => left.order - right.order);
  expect(savedLanes).toHaveLength(3);
  expect(savedLanes[0].id).toBe(derivedLaneId);
  // 最初のmousemoveだけでハンドルが再生成される不具合を検出する。
  expect(savedLanes[0].height - 220).toBeGreaterThan(65 / zoom);
  expect(savedLanes.slice(1).map((lane) => lane.height)).toEqual([220, 220]);
  expect(after.artifacts).toEqual(before.artifacts);
  expect(mlcColumns(after).view.artifactPlacements).toEqual(
    mlcColumns(before).view.artifactPlacements,
  );

  await page.getByRole('button', { name: '元に戻す' }).click();
  const undone = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(undone.processActorLanes).toEqual([]);
  await expect(
    page.getByTestId(`actor-lane-resize-bottom-${derivedLaneId}`),
  ).toBeVisible();

  await page.getByRole('button', { name: 'やり直す' }).click();
  const redone = await downloadCurrentModel<ResizableModel>(page);
  expect(redone.model.processActorLanes).toEqual(after.processActorLanes);
  const savedPath = await redone.download.path();
  if (!savedPath) throw new Error('保存したJSONのパスを取得できませんでした');
  await page.getByTestId('new-model').click();
  await page.getByLabel('PRePモデルJSONを読み込む').setInputFiles(savedPath);
  const restored = (await downloadCurrentModel<ResizableModel>(page)).model;
  expect(restored.processActorLanes).toEqual(after.processActorLanes);
});

test('アクターとサブプロセスを作成してから4種類の成果物を責任グリッドへ追加できる', async ({
  page,
}) => {
  await page.getByTestId('add-actor').click();
  await page.getByTestId('add-subprocess').click();

  const grid = page.getByTestId('process-grid');
  await expect(grid).toBeVisible();
  await expect(grid.locator('.process-grid-node__lane-header')).toHaveCount(1);
  await expect(grid.locator('.process-grid-node__column-header')).toHaveCount(1);
  await expect(grid.getByText('新しいアクター', { exact: true })).toBeVisible();
  await expect(
    grid.getByRole('button', { name: '新しいサブプロセスを開く' }),
  ).toBeVisible();

  await page.getByTestId('add-intermediate').click();
  await page.getByTestId('add-final').click();
  await page.getByTestId('add-milestone').click();
  await page.getByTestId('add-intangible').click();

  await expect(artifactNodes(page)).toHaveCount(4);
  await expect(page.locator('.artifact-node--intermediate')).toHaveCount(1);
  await expect(page.locator('.artifact-node--final')).toHaveCount(1);
  await expect(page.locator('.artifact-node--milestone')).toHaveCount(1);
  await expect(page.locator('.artifact-node--intangible')).toHaveCount(1);
  await expect(page.getByLabel('モデル要素数')).toContainText('2 プロセス');
  await expect(page.getByLabel('モデル要素数')).toContainText('4 成果物');

  const nameInput = page.getByTestId('artifact-name-input');
  await expect(nameInput).toHaveValue('新しい無実体成果物');
  await nameInput.fill('編集した研究上の知見');
  await expect(
    page.locator('.artifact-node--intangible').getByText(
      '編集した研究上の知見',
      { exact: true },
    ),
  ).toBeVisible();
});

test('最終成果物がない空モデルを検証するとE007を表示する', async ({
  page,
}) => {
  await page.getByTestId('validate-model').click();

  const issue = page.getByTestId('validation-E007');
  await expect(issue).toBeVisible();
  await expect(issue).toContainText('1つ以上の最終成果物が必要です');

  await issue.click();
  await expect(page.getByTestId('process-canvas')).toBeVisible();
});

test('信頼性要求からの保証連鎖は引継ぎ条件まで到達する', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');

  await page
    .getByTestId('artifact-node-artifact-reliability-requirements')
    .click();
  const traceButton = page.getByRole('button', {
    name: '保証連鎖',
    exact: true,
  });
  await expect(traceButton).toBeEnabled();
  await traceButton.click();

  await expect(
    page.getByText('最終成果物まで到達できます', { exact: true }),
  ).toBeVisible();
  const downstreamResults = page.locator('.analysis-list').filter({
    has: page.getByRole('heading', { name: /下流成果物/ }),
  });
  await expect(
    downstreamResults.getByRole('button', { name: /引継ぎ条件/ }),
  ).toBeVisible();
  await expect(
    page.getByTestId('artifact-node-artifact-handover-conditions'),
  ).toHaveClass(/is-highlighted/);
});

test('モデルをv1.3の正規prep.jsonとして保存できる', async ({ page }) => {
  await loadTemplate(page, 'template-constrained-mlc');
  await expect(artifactNodes(page)).toHaveCount(8);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save-json').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(
    '制約付き多ラベル分類システムのテスト設計.prep.json',
  );

  const savedModel = await readDownloadedJson<{
    schemaVersion: string;
    metadata: { modelName: string };
    processes: unknown[];
    actors: unknown[];
    processActorLanes: unknown[];
    artifacts: unknown[];
    relations: unknown[];
    processHandoffs: unknown[];
    layout: {
      nodes?: unknown;
      viewport?: unknown;
      processViews: unknown[];
      overview: { nodes: unknown[] };
      lastView: { mode: string; activeProcessId?: string };
    };
  }>(download);

  expect(savedModel.schemaVersion).toBe('1.3.0');
  expect(savedModel.metadata.modelName).toBe(
    '制約付き多ラベル分類システムのテスト設計',
  );
  expect(savedModel.processes).toHaveLength(3);
  expect(savedModel.actors).toHaveLength(3);
  expect(savedModel.processActorLanes).toHaveLength(3);
  expect(savedModel.artifacts).toHaveLength(8);
  expect(savedModel.relations).toHaveLength(8);
  expect(savedModel.processHandoffs).toHaveLength(0);
  expect(savedModel.layout.processViews).toHaveLength(3);
  expect(savedModel.layout.overview.nodes).toHaveLength(1);
  expect(savedModel.layout.lastView).toEqual({
    mode: 'process',
    activeProcessId: 'process-mlc-test-design',
  });
  expect(savedModel.layout).not.toHaveProperty('nodes');
  expect(savedModel.layout).not.toHaveProperty('viewport');
});

test('コーヒーテンプレートの鳥瞰図はトップレベルプロセスを二重丸で示し引継ぎを表示する', async ({
  page,
}) => {
  await loadTemplate(page, 'template-coffee');

  await expect(page.getByTestId('overview-canvas')).toBeVisible();
  await expect(page.getByTestId('process-canvas')).toHaveCount(0);

  const processNodes = page.locator('[data-testid^="overview-process-"]');
  await expect(processNodes).toHaveCount(2);
  const brewProcess = page.getByTestId(
    'overview-process-process-brew-coffee',
  );
  const receiveProcess = page.getByTestId(
    'overview-process-process-receive-coffee',
  );
  await expect(brewProcess).toHaveAccessibleName('プロセス コーヒーを淹れる');
  await expect(receiveProcess).toHaveAccessibleName(
    'プロセス コーヒーを受け取る',
  );
  await expect(brewProcess.locator('.overview-process-node__inner')).toHaveCount(1);
  await expect(receiveProcess.locator('.overview-process-node__inner')).toHaveCount(1);

  const handoffEdge = page.getByTestId(
    'process-handoff-edge-handoff-coffee-to-receiver',
  );
  await expect(handoffEdge).toBeAttached();
  await expect(handoffEdge.locator('.handoff-edge__path')).toHaveAttribute(
    'd',
    /^M/,
  );
  await expect(page.locator('.handoff-edge__label')).toBeVisible();
  await expect(page.locator('.handoff-edge__label')).toHaveText(
    '提供用コーヒー',
  );
  await expect(page.getByLabel('モデル要素数')).toContainText('1 関係');
});

test('成果物は8方向の接続点を持ち選択したアンカーをJSONへ保存する', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');
  await page.getByRole('button', { name: '全体表示', exact: true }).click();

  const source = page.getByTestId(
    'artifact-node-artifact-reliability-requirements',
  );
  const target = page.getByTestId(
    'artifact-node-artifact-handover-conditions',
  );
  await source.click();

  const sourceAnchors = source.locator('[data-anchor]');
  const targetAnchors = target.locator('[data-anchor]');
  await expect(sourceAnchors).toHaveCount(8);
  await expect(targetAnchors).toHaveCount(8);
  expect(await sourceAnchors.evaluateAll((handles) =>
    handles.map((handle) => handle.getAttribute('data-anchor')),
  )).toEqual(anchorPositions);

  await connectHandles(
    page,
    source.locator('[data-anchor="ne"]'),
    target.locator('[data-anchor="sw"]'),
  );

  const dialog = page.getByRole('dialog', { name: '関係を作成' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('始点接続点').selectOption('ne');
  await dialog.getByLabel('終点接続点').selectOption('sw');
  await dialog.getByTestId('confirm-relation').click();
  await expect(relationEdges(page)).toHaveCount(9);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save-json').click();
  const savedModel = await readDownloadedJson<{
    relations: Array<{
      sourceId: string;
      targetId: string;
      sourceAnchor: string;
      targetAnchor: string;
    }>;
  }>(await downloadPromise);
  const relation = savedModel.relations.find(
    (item) =>
      item.sourceId === 'artifact-reliability-requirements' &&
      item.targetId === 'artifact-handover-conditions',
  );
  expect(relation).toMatchObject({ sourceAnchor: 'ne', targetAnchor: 'sw' });
  expect(
    savedModel.relations.every(
      (item) =>
        anchorPositions.includes(item.sourceAnchor as (typeof anchorPositions)[number]) &&
        anchorPositions.includes(item.targetAnchor as (typeof anchorPositions)[number]),
    ),
  ).toBe(true);
});

test('キャンバス全体をPNGとSVGとしてダウンロードできる', async ({
  page,
}) => {
  await loadTemplate(page, 'template-constrained-mlc');
  await expect(artifactNodes(page)).toHaveCount(8);

  const pngDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toBe(
    '制約付き多ラベル分類システムのテスト設計-テスト設計プロセス.png',
  );
  const pngPath = await pngDownload.path();
  if (!pngPath) throw new Error('PNGのダウンロードパスを取得できませんでした');
  const png = await readFile(pngPath);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(png.byteLength).toBeGreaterThan(10_000);

  const svgDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG出力', exact: true }).click();
  const svgDownload = await svgDownloadPromise;
  expect(svgDownload.suggestedFilename()).toBe(
    '制約付き多ラベル分類システムのテスト設計-テスト設計プロセス.svg',
  );
  const svgPath = await svgDownload.path();
  if (!svgPath) throw new Error('SVGのダウンロードパスを取得できませんでした');
  const svg = await readFile(svgPath, 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('信頼性要求');
  expect(svg).toContain('引継ぎ条件');
  expect(svg).toContain('relation-edge-');
  expect(svg).not.toContain('react-flow__handle');
  expect(svg).not.toContain('is-selected');
});

test('不正なv1.3 JSONはモデルを置換せずE011を表示する', async ({
  page,
}) => {
  await page.getByLabel('PRePモデルJSONを読み込む').setInputFiles({
    name: 'invalid.prep.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: '1.3.0',
        metadata: { modelName: '壊れたモデル' },
      }),
    ),
  });

  const schemaError = page.getByRole('alert').filter({
    hasText: 'E011 JSONスキーマ不正',
  });
  await expect(schemaError).toBeVisible();
  await expect(schemaError.getByRole('listitem')).not.toHaveCount(0);
  await expect(page.getByTestId('process-canvas')).toBeVisible();
  await expect(artifactNodes(page)).toHaveCount(0);
});
