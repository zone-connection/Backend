import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { CreatePropostaDto } from "./dto/create-proposta.dto";
import { PropostaPublicaService } from "./proposta-publica.service";

@Controller("publico/propostas")
export class PublicoPropostasController {
  constructor(private readonly publica: PropostaPublicaService) {}

  @Public()
  @Get("recibo/:compradorToken")
  recibo(@Param("compradorToken") compradorToken: string) {
    return this.publica.recibo(compradorToken);
  }

  @Public()
  @Get(":token")
  resumo(@Param("token") token: string) {
    return this.publica.resumo(token);
  }

  @Public()
  @Post(":token")
  enviar(
    @Param("token") token: string,
    @Body() dto: CreatePropostaDto,
  ) {
    return this.publica.enviar(token, dto);
  }
}
