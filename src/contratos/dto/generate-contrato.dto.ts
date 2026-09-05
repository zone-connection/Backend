import { IsIn, IsObject } from 'class-validator';

export const CONTRATO_TEMPLATE_IDS = ['checklist-renda-informal'] as const;
export type ContratoTemplateId = (typeof CONTRATO_TEMPLATE_IDS)[number];

export class GenerateContratoDto {
  @IsIn(CONTRATO_TEMPLATE_IDS, { message: 'Modelo de contrato inválido.' })
  templateId!: ContratoTemplateId;

  @IsObject({ message: 'Informe os dados do documento.' })
  values!: Record<string, string>;
}
