import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export const CONTRATO_TEMPLATE_IDS = [
  'carta-cancelamento',
  'recibo-pagamento',
  'parentesco-sem-conjuge',
  'parentesco-com-conjuge',
  'intermediacao',
  'checklist-renda-informal',
  'saas-ouro',
  'saas-prata-admin',
  'saas-prata-financeiro',
] as const;
export type ContratoTemplateId = (typeof CONTRATO_TEMPLATE_IDS)[number];

export class GenerateContratoDto {
  @IsIn(CONTRATO_TEMPLATE_IDS, { message: 'Modelo de contrato inválido.' })
  templateId!: ContratoTemplateId;

  @IsObject({ message: 'Informe os dados do documento.' })
  values!: Record<string, string>;
}

export class UpsertContratoDocumentoDto {
  @IsIn(CONTRATO_TEMPLATE_IDS, { message: 'Modelo de contrato inválido.' })
  templateId!: ContratoTemplateId;

  @IsObject({ message: 'Informe os dados do documento.' })
  values!: Record<string, string>;

  @IsOptional()
  @IsIn(['rascunho', 'baixado'], { message: 'Status inválido.' })
  status?: 'rascunho' | 'baixado';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  titulo?: string;
}
