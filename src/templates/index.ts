import type { PrepModelFile } from '../domain/model';
import {
  createCoffeeProcessModel,
  createCoffeeProcessTemplate,
} from './coffeeProcess';
import {
  createConstrainedMlcTestingModel,
  createConstrainedMlcTestingTemplate,
} from './constrainedMlcTesting';
import { createEmptyModel, createEmptyModelTemplate } from './emptyModel';

export {
  createCoffeeProcessModel,
  createCoffeeProcessTemplate,
  createConstrainedMlcTestingModel,
  createConstrainedMlcTestingTemplate,
  createEmptyModel,
  createEmptyModelTemplate,
};

export type ModelTemplateId = 'empty' | 'constrained-mlc' | 'coffee';

export interface ModelTemplateDefinition {
  id: ModelTemplateId;
  name: string;
  description: string;
  createModel: (now?: string | Date) => PrepModelFile;
}

export const modelTemplates: ModelTemplateDefinition[] = [
  {
    id: 'empty',
    name: '空のモデル',
    description: 'トップレベルプロセス1件からPRePモデルを作成します。',
    createModel: createEmptyModel,
  },
  {
    id: 'constrained-mlc',
    name: '制約付き多ラベル分類システムのテスト設計',
    description: '3アクター×2サブプロセスに配置した8成果物の保証連鎖です。',
    createModel: createConstrainedMlcTestingModel,
  },
  {
    id: 'coffee',
    name: 'コーヒーを淹れるプロセス',
    description: '2プロセス間の成果物引継ぎを確認する最小サンプルです。',
    createModel: createCoffeeProcessModel,
  },
];

export function createModelFromTemplate(
  templateId: ModelTemplateId,
  now?: string | Date,
): PrepModelFile {
  const template = modelTemplates.find(({ id }) => id === templateId);

  if (template === undefined) {
    throw new Error(`Unknown template: ${String(templateId)}`);
  }

  return template.createModel(now);
}
