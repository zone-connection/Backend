import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentacaoDto } from './create-documentacao.dto';

function base(extra: Record<string, unknown> = {}) {
  return {
    nome: 'Cliente teste',
    fonte: 'Outro',
    status1: 'Em análise',
    status2: 'Andamento',
    ...extra,
  };
}

describe('CreateDocumentacaoDto leadId opcional', () => {
  it('aceita ficha sem lead nem cliente', async () => {
    const dto = plainToInstance(CreateDocumentacaoDto, base());
    const errors = await validate(dto);
    assert.equal(errors.length, 0);
    assert.equal(dto.leadId, undefined);
  });

  it('aceita leadId nulo ou vazio', async () => {
    for (const leadId of [null, '']) {
      const dto = plainToInstance(CreateDocumentacaoDto, base({ leadId }));
      const errors = await validate(dto);
      assert.equal(errors.length, 0, `falhou para ${JSON.stringify(leadId)}`);
    }
  });

  it('aceita UUID de lead/cliente existente', async () => {
    const dto = plainToInstance(
      CreateDocumentacaoDto,
      base({ leadId: 'd4a3ffb2-c524-4c91-a5bd-eedace334ae9' }),
    );
    const errors = await validate(dto);
    assert.equal(errors.length, 0);
    assert.equal(dto.leadId, 'd4a3ffb2-c524-4c91-a5bd-eedace334ae9');
  });

  it('aceita ficha de usado com origem separada da fonte', async () => {
    const dto = plainToInstance(
      CreateDocumentacaoDto,
      base({
        origem: 'usado',
        fonte: 'Indicação',
        proprietarioId: 'd4a3ffb2-c524-4c91-a5bd-eedace334ae9',
        interessadoId: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
        matricula: '12345',
      }),
    );
    const errors = await validate(dto);
    assert.equal(errors.length, 0);
    assert.equal(dto.origem, 'usado');
    assert.equal(dto.fonte, 'Indicação');
    assert.equal(dto.matricula, '12345');
  });

  it('rejeita origem que não seja lançamento ou usado', async () => {
    const dto = plainToInstance(
      CreateDocumentacaoDto,
      base({ origem: 'aluguel' }),
    );
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'origem'));
  });

  it('rejeita leadId inválido', async () => {
    const dto = plainToInstance(
      CreateDocumentacaoDto,
      base({ leadId: 'nao-e-uuid' }),
    );
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'leadId'));
  });
});
