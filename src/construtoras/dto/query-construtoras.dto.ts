import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { Transform } from "class-transformer";

export class QueryConstrutorasDto {
  @IsOptional()
  @IsIn(["created_desc", "created_asc", "nome_asc", "nome_desc"], {
    message:
      "Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.",
  })
  sort?: "created_desc" | "created_asc" | "nome_asc" | "nome_desc";

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    return String(value);
  })
  @IsUUID("4", { message: "Localidade inválida." })
  localidadeId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return undefined;
  })
  comDrive?: boolean;
}

