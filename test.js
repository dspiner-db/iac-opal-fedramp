const SubnetCalc = require('subnet-cidr-calculator')
//.filter(s => s.value.includes('/19'))
let test = SubnetCalc.calculate('10.0.0.0','22', ['10.0.0.0/24'])
console.log(JSON.stringify(test, null, 2))