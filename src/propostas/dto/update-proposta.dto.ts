import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { PropostaStatus } from "@prisma/client";

/** Campos Int em reais: aceita decimal e arredonda. */
function toOptionalInt({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return Math.round(n);
}

/** Campos com centavos (ex.: parcela Caixa). */
function toOptionalMoney({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return Math.round(n * 100) / 100;
}

function toIntArray({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((item) => Number(item))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((n) => Math.round(n));
}

export class UpdatePropostaDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== "")
  @IsUUID("4", { message: "Lead/cliente inválido." })
  leadId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Informe o nome do cliente." })
  @MaxLength(120)
  clienteNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  clienteTelefone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  clienteCpf?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  clienteRg?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  clienteRgOrgaoEmissor?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== "")
  @IsDateString()
  clienteDataNascimento?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  clienteNacionalidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clienteEstadoCivil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  clienteRegimeBens?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== "")
  @IsDateString()
  clienteDataCasamento?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clienteNomePai?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clienteNomeMae?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalMoney)
  @IsNumber({}, { message: "Renda inválida." })
  @Min(0)
  clienteRenda?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  clienteTelefoneFixo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  clienteEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  clienteEnderecoResidencial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clienteBairroResidencial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clienteCidadeResidencial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  clienteUfResidencial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  clienteCepResidencial?: string | null;

  @IsOptional()
  @IsBoolean()
  clienteCobrancaResidencial?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clienteEmpregador?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clienteProfissao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  clienteEnderecoComercial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clienteBairroComercial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clienteCidadeComercial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  clienteUfComercial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  clienteCepComercial?: string | null;

  @IsOptional()
  @IsBoolean()
  clienteCobrancaComercial?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  clienteSite?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  clienteTelefoneComercial1?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  clienteTelefoneComercial2?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== "")
  @IsUUID("4", { message: "Construtora inválida." })
  construtoraId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== "")
  @IsUUID("4", { message: "Empreendimento inválido." })
  empreendimentoId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  unidade?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== "")
  @IsUUID("4", { message: "Corretor inválido." })
  corretorId?: string | null;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: "Valor de venda inválido." })
  @Min(0, { message: "Valor de venda não pode ser negativo." })
  valor?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: "Sinal inválido." })
  @Min(0)
  entrada?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: "Apartado inválido." })
  @Min(0)
  apartado?: number | null;

  @IsOptional()
  @Transform(toIntArray)
  @IsArray({ message: "Pré-chaves deve ser uma lista." })
  @IsInt({ each: true, message: "Pré-chaves inválido." })
  @Min(0, { each: true })
  preChaves?: number[];

  @IsOptional()
  @Transform(toIntArray)
  @IsArray({ message: "Pós-chaves deve ser uma lista." })
  @IsInt({ each: true, message: "Pós-chaves inválido." })
  @Min(0, { each: true })
  posChaves?: number[];

  @IsOptional()
  @Transform(toIntArray)
  @IsArray({ message: "Intercaladas deve ser uma lista." })
  @IsInt({ each: true, message: "Intercaladas inválidas." })
  @Min(0, { each: true })
  intercaladas?: number[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: "FGTS inválido." })
  @Min(0)
  fgts?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: "Mora Bem inválido." })
  @Min(0)
  moraBem?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: "MCMV inválido." })
  @Min(0)
  mcmv?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalMoney)
  @IsNumber({}, { message: "Parcela Caixa inválida." })
  @Min(0)
  parcelaCaixa?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: "Financiamento inválido." })
  @Min(0)
  financiamento?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: "Desconto inválido." })
  @Min(0)
  desconto?: number | null;

  @IsOptional()
  @IsEnum(PropostaStatus, { message: "Status inválido." })
  status?: PropostaStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== "")
  @IsDateString({}, { message: "Validade inválida." })
  validade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string | null;
}
