import { IsBoolean, IsOptional } from 'class-validator';

/** Só operações imobiliárias — o admin do tenant não altera o plano CRM. */
export class UpdateTenantOperationModulesDto {
  @IsOptional()
  @IsBoolean()
  captacao?: boolean;

  @IsOptional()
  @IsBoolean()
  imoveisUsados?: boolean;

  @IsOptional()
  @IsBoolean()
  locacao?: boolean;

  /** Oculta Clientes e Funil de Clientes do menu (telas continuam acessíveis). */
  @IsOptional()
  @IsBoolean()
  hideClientesNav?: boolean;

  /** Admin vê clientes dos corretores na lista e no funil. */
  @IsOptional()
  @IsBoolean()
  adminVerClientesCorretor?: boolean;
}
