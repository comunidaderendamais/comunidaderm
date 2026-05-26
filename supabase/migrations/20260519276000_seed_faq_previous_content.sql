insert into public.faq_items (sort, q, a)
select *
from (
  values
    (
      0,
      jsonb_build_object(
        'pt', 'O que e a Renda Mais?',
        'en', 'What is Renda Mais?',
        'es', '¿Que es Renda Mais?'
      ),
      jsonb_build_object(
        'pt', 'A Renda Mais e a plataforma da comunidade para aquisicao de cotas, acompanhamento de bancas, ganhos de equipe, residual e bolsao elite.',
        'en', 'Renda Mais is the community platform for acquiring quotas, tracking banks, team earnings, residual income, and the elite pool.',
        'es', 'Renda Mais es la plataforma de la comunidad para adquirir cuotas, seguir bancas, ganancias de equipo, residual y bolsón elite.'
      )
    ),
    (
      1,
      jsonb_build_object(
        'pt', 'Como funcionam as cotas?',
        'en', 'How do quotas work?',
        'es', '¿Como funcionan las cuotas?'
      ),
      jsonb_build_object(
        'pt', 'As cotas representam sua participacao no sistema. Cada plano tem quantidade de cotas, ciclo de 6 meses e regras de renovacao ou desistência definidas pelo projeto.',
        'en', 'Quotas represent your participation in the system. Each plan has a quota amount, a 6-month cycle, and renewal or cancellation rules defined by the project.',
        'es', 'Las cuotas representan tu participacion en el sistema. Cada plan tiene cantidad de cuotas, ciclo de 6 meses y reglas de renovacion o cancelacion definidas por el proyecto.'
      )
    ),
    (
      2,
      jsonb_build_object(
        'pt', 'Quais criptos e redes sao aceitas?',
        'en', 'Which cryptos and networks are accepted?',
        'es', '¿Que criptos y redes se aceptan?'
      ),
      jsonb_build_object(
        'pt', 'USDT nas redes BEP-20 e TRC-20, USDC na rede Arbitrum, alem da opcao de compra usando saldo disponivel quando houver liberacao.',
        'en', 'USDT on BEP-20 and TRC-20, USDC on Arbitrum, plus the option to buy using available balance when released.',
        'es', 'USDT en las redes BEP-20 y TRC-20, USDC en Arbitrum, ademas de la opcion de compra usando saldo disponible cuando este liberado.'
      )
    ),
    (
      3,
      jsonb_build_object(
        'pt', 'Quando recebo o primeiro rendimento?',
        'en', 'When do I receive the first earning?',
        'es', '¿Cuando recibo el primer rendimiento?'
      ),
      jsonb_build_object(
        'pt', 'O primeiro rendimento entra no proximo fechamento de pagamento apos a ativacao da compra, seguindo as regras operacionais da plataforma.',
        'en', 'Your first earning is credited at the next payout window after purchase activation, following the platform operational rules.',
        'es', 'Tu primer rendimiento se acredita en la siguiente ventana de pago despues de la activacion de la compra, siguiendo las reglas operativas de la plataforma.'
      )
    ),
    (
      4,
      jsonb_build_object(
        'pt', 'Como funciona o saque?',
        'en', 'How does withdrawal work?',
        'es', '¿Como funciona el retiro?'
      ),
      jsonb_build_object(
        'pt', 'O saque depende de carteira cadastrada, saldo disponivel e regras de liberacao. Existe taxa fixa operacional e valor minimo configurado pela plataforma.',
        'en', 'Withdrawal depends on a registered wallet, available balance, and release rules. There is a fixed operational fee and a minimum amount configured by the platform.',
        'es', 'El retiro depende de una billetera registrada, saldo disponible y reglas de liberacion. Existe una tarifa fija operativa y un monto minimo configurado por la plataforma.'
      )
    ),
    (
      5,
      jsonb_build_object(
        'pt', 'Como funcionam os ganhos de equipe e o residual?',
        'en', 'How do team earnings and residual income work?',
        'es', '¿Como funcionan las ganancias de equipo y el residual?'
      ),
      jsonb_build_object(
        'pt', 'Os ganhos de equipe seguem as regras oficiais do projeto: TE por niveis iniciais, residual diario por rank e volume de rede calculado no servidor conforme as regras vigentes.',
        'en', 'Team earnings follow the project official rules: entry-fee earnings on early levels, daily residual by rank, and network volume calculated server-side according to the active rules.',
        'es', 'Las ganancias de equipo siguen las reglas oficiales del proyecto: TE en niveles iniciales, residual diario por rango y volumen de red calculado en el servidor segun las reglas vigentes.'
      )
    ),
    (
      6,
      jsonb_build_object(
        'pt', 'O que acontece no fim do ciclo?',
        'en', 'What happens at the end of the cycle?',
        'es', '¿Que pasa al final del ciclo?'
      ),
      jsonb_build_object(
        'pt', 'Ao final do ciclo, a plataforma aplica as regras de encerramento, renovacao dentro da janela permitida ou desistência conforme configuracao administrativa e regras do projeto.',
        'en', 'At the end of the cycle, the platform applies the closing, renewal within the allowed window, or cancellation rules according to admin settings and project rules.',
        'es', 'Al final del ciclo, la plataforma aplica las reglas de cierre, renovacion dentro de la ventana permitida o cancelacion segun la configuracion administrativa y las reglas del proyecto.'
      )
    ),
    (
      7,
      jsonb_build_object(
        'pt', 'Como funciona o Bolsao Elite?',
        'en', 'How does the Elite Pool work?',
        'es', '¿Como funciona el Bolsón Elite?'
      ),
      jsonb_build_object(
        'pt', 'O Bolsao Elite usa percentual do lucro quinzenal informado no Admin e distribui vagas por rank conforme a ordem de qualificacao registrada no sistema.',
        'en', 'The Elite Pool uses a percentage of the biweekly profit informed in Admin and distributes slots by rank according to the qualification order recorded in the system.',
        'es', 'El Bolsón Elite usa un porcentaje de la ganancia quincenal informada en Admin y distribuye plazas por rango segun el orden de calificacion registrado en el sistema.'
      )
    )
) as seed(sort, q, a)
where not exists (
  select 1 from public.faq_items
);
