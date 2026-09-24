const form = document.querySelector('#salary-form');
const salaryResult = document.querySelector('#salary-result');
const emptyResult = document.querySelector('#empty-result');
const alertsList = document.querySelector('#alerts-list');
const alertCount = document.querySelector('#alert-count');
const conditionalFields = document.querySelector('#conditional-fields');
const alimonyAmountWrap = document.querySelector('#alimony-amount-wrap');
const debtAmountWrap = document.querySelector('#debt-amount-wrap');
const authorizationRow = document.querySelector('#authorization-row');

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

const MINIMUM_WAGE = 365;
const MINIMUM_NET_SALARY = 100;

const RATES = {
  isss: 0.03,
  afp: 0.0725
};

document.querySelector('#current-year').textContent = new Date().getFullYear();

function updateConditionalFields() {
  const hasAlimony = document.querySelector('#include-alimony').checked;
  const hasDebt = document.querySelector('#include-debt').checked;
  const hasVariableDeduction = hasAlimony || hasDebt;

  conditionalFields.hidden = !hasVariableDeduction;
  alimonyAmountWrap.hidden = !hasAlimony;
  debtAmountWrap.hidden = !hasDebt;
  authorizationRow.hidden = !hasVariableDeduction;
}

document.querySelectorAll('.deduction-item input').forEach((checkbox) => {
  checkbox.addEventListener('change', updateConditionalFields);
});

function getInitials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function addAlert(type, title, message) {
  const icon = type === 'info' ? 'i' : '!';

  return `
    <article class="alert-item ${type}">
      <span class="alert-icon">${icon}</span>
      <div>
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
    </article>
  `;
}

function createAlerts(data) {
  const alerts = [];

  if (data.gross < MINIMUM_WAGE) {
    alerts.push(
      addAlert(
        'warning',
        'Salario bajo el mínimo',
        `El salario registrado (${money.format(data.gross)}) está por debajo del salario mínimo de referencia (${money.format(MINIMUM_WAGE)}).`
      )
    );
  }

  if (data.hasAlimony) {
    alerts.push(
      addAlert(
        'info',
        'Retención por alimentos',
        'Existe una pensión alimenticia configurada. Verifica la orden judicial, el porcentaje y su vigencia antes de procesar el pago.'
      )
    );
  }

  if (data.hasDebt && !data.hasAuthorization) {
    alerts.push(
      addAlert(
        'warning',
        'Descuento requiere respaldo',
        'El descuento por deuda no tiene una autorización u orden legal registrada. Debe verificarse su fundamento antes de aplicarlo.'
      )
    );
  }

  if (data.hasDebt && data.hasAuthorization) {
    alerts.push(
      addAlert(
        'warning',
        'Verificar límite de embargo',
        'El embargo corresponde a una deuda ordinaria. Debe verificarse el límite legal aplicable y la documentación que lo sustenta.'
      )
    );
  }

  if (
    (data.includeIsss || data.includeAfp) &&
    !data.isssRemitted
  ) {
    alerts.push(
      addAlert(
        'warning',
        'Cotizaciones no enteradas',
        'Se descontó una cotización al trabajador, pero el sistema no registra confirmación de que haya sido enterada.'
      )
    );
  }

  if (!alerts.length) {
    alerts.push(
      addAlert(
        'info',
        'Sin alertas detectadas',
        'Los datos ingresados no activan alertas en las reglas de esta revisión. Conserva los respaldos correspondientes.'
      )
    );
  }

  return alerts;
}

function renderResult(data) {
  document.querySelector('#result-name').textContent = data.name;
  document.querySelector('#result-role').textContent =
    `${data.role} · ${data.type}`;

  document.querySelector('#worker-avatar').textContent =
    getInitials(data.name);

  document.querySelector('#result-gross').textContent =
    money.format(data.gross);

  document.querySelector('#result-net').textContent =
    money.format(data.net);

  document.querySelector('#deductions-breakdown').innerHTML =
    data.deductions
      .map(
        (deduction) => `
          <div class="deduction-row">
            <span>${deduction.label}</span>
            <strong>- ${money.format(deduction.amount)}</strong>
          </div>
        `
      )
      .join('');

  const alerts = createAlerts(data);

  alertsList.innerHTML = alerts.join('');

  const activeAlerts =
    data.gross < MINIMUM_WAGE ||
    data.hasAlimony ||
    (data.hasDebt && !data.hasAuthorization) ||
    (data.hasDebt && data.hasAuthorization) ||
    ((data.includeIsss || data.includeAfp) && !data.isssRemitted);

  alertCount.textContent =
    `${activeAlerts ? alerts.length : 0} activas`;

  emptyResult.hidden = true;
  salaryResult.hidden = false;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const gross =
    Number(document.querySelector('#gross-salary').value) || 0;

  const includeIsss =
    document.querySelector('#include-isss').checked;

  const includeAfp =
    document.querySelector('#include-afp').checked;

  const hasAlimony =
    document.querySelector('#include-alimony').checked;

  const hasDebt =
    document.querySelector('#include-debt').checked;

  const deductions = [];

  if (includeIsss) {
    deductions.push({
      label: 'ISSS (3.00%)',
      amount: gross * RATES.isss
    });
  }

  if (includeAfp) {
    deductions.push({
      label: 'AFP (7.25%)',
      amount: gross * RATES.afp
    });
  }

  if (hasAlimony) {
    deductions.push({
      label: 'Pensión alimenticia',
      amount:
        Number(document.querySelector('#alimony-amount').value) || 0
    });
  }

  if (hasDebt) {
    deductions.push({
      label: 'Otros descuentos / deudas',
      amount:
        Number(document.querySelector('#debt-amount').value) || 0
    });
  }

  const totalDeductions = deductions.reduce(
    (total, deduction) => total + deduction.amount,
    0
  );

  const net = Math.max(0, gross - totalDeductions);

  /*
   * REGLA:
   * El sistema no permite generar el cálculo
   * si el salario líquido es menor a $100.
   */
  if (net < MINIMUM_NET_SALARY) {
    emptyResult.hidden = false;
    salaryResult.hidden = true;

    alertsList.innerHTML = `
      <article class="alert-item warning salary-blocked">
        <span class="alert-icon">!</span>
        <div>
          <strong>Cálculo bloqueado</strong>
          <p>
            El salario líquido resultante es de ${money.format(net)}.
            No se puede procesar un salario líquido inferior a
            ${money.format(MINIMUM_NET_SALARY)}.
            Revisa el salario bruto y los descuentos aplicados.
          </p>
        </div>
      </article>
    `;

    alertCount.textContent = '1 activa';

    return;
  }

  renderResult({
    name: document.querySelector('#worker-name').value,
    role: document.querySelector('#worker-role').value,
    type: document.querySelector('#worker-type').selectedOptions[0].textContent,
    gross,
    includeIsss,
    includeAfp,
    hasAlimony,
    hasDebt,
    hasAuthorization:
      document.querySelector('#has-authorization').checked,
    isssRemitted:
      document.querySelector('#isss-remitted').checked,
    deductions,
    net
  });
});

updateConditionalFields();