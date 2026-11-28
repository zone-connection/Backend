import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMetaDto } from './create-meta.dto';

function base(tipo: string) {
  return {
    tipo,
    periodo: 'mensal',
    titulo: 'Meta do mês',
    valor: 5,
  };
}

describe('CreateMetaDto tipos leads e ligacoes', () => {
  it('aceita meta de leads criados e de ligações', async () => {
    for (const tipo of ['leads', 'ligacoes', 'agendamentos', 'vendas', 'documentacoes', 'vgv']) {
      const dto = plainToInstance(CreateMetaDto, base(tipo));
      const errors = await validate(dto);
      assert.equal(errors.length, 0, tipo);
    }
  });

  it('recusa indicador desconhecido', async () => {
    const dto = plainToInstance(CreateMetaDto, base('reuniao'));
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'tipo'));
  });
});
