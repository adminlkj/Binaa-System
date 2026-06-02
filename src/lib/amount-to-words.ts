/**
 * Convert a number to Arabic words (Saudi Riyals)
 * Example: 37950.00 → "سبعة وثلاثون ألفاً وتسعمائة وخمسون ريالاً سعودياً فقط لا غير"
 */
export function numberToArabicWords(amount: number): string {
  if (amount === 0) return 'صفر ريالاً سعودياً فقط لا غير'

  const riyals = Math.floor(amount)
  const halalas = Math.round((amount - riyals) * 100)

  const ones = [
    '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة',
    'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
    'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
    'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'
  ]
  const tens = [
    '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون',
    'ستون', 'سبعون', 'ثمانون', 'تسعون'
  ]
  const hundreds = [
    '', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة',
    'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'
  ]

  function convertBelow1000(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) {
      const t = Math.floor(n / 10)
      const o = n % 10
      if (o === 0) return tens[t]
      return ones[o] + ' و' + tens[t]
    }
    if (n < 1000) {
      const h = Math.floor(n / 100)
      const remainder = n % 100
      if (remainder === 0) return hundreds[h]
      return hundreds[h] + ' و' + convertBelow1000(remainder)
    }
    return ''
  }

  function convertNumber(n: number): string {
    if (n === 0) return ''

    if (n < 1000) return convertBelow1000(n)

    if (n < 1000000) {
      const thousands = Math.floor(n / 1000)
      const remainder = n % 1000
      let thousandWord = ''
      if (thousands === 1) thousandWord = 'ألف'
      else if (thousands === 2) thousandWord = 'ألفان'
      else if (thousands <= 10) thousandWord = convertBelow1000(thousands) + ' آلاف'
      else thousandWord = convertBelow1000(thousands) + ' ألفاً'

      if (remainder === 0) return thousandWord
      return thousandWord + ' و' + convertBelow1000(remainder)
    }

    if (n < 1000000000) {
      const millions = Math.floor(n / 1000000)
      const remainder = n % 1000000
      let millionWord = ''
      if (millions === 1) millionWord = 'مليون'
      else if (millions === 2) millionWord = 'مليونان'
      else if (millions <= 10) millionWord = convertBelow1000(millions) + ' ملايين'
      else millionWord = convertBelow1000(millions) + ' مليوناً'

      if (remainder === 0) return millionWord
      return millionWord + ' و' + convertNumber(remainder)
    }

    const billions = Math.floor(n / 1000000000)
    const remainder = n % 1000000000
    let billionWord = ''
    if (billions === 1) billionWord = 'مليار'
    else if (billions === 2) billionWord = 'ملياران'
    else billionWord = convertBelow1000(billions) + ' ملياراً'

    if (remainder === 0) return billionWord
    return billionWord + ' و' + convertNumber(remainder)
  }

  let result = ''
  if (riyals > 0) {
    result = convertNumber(riyals) + ' ريالاً سعودياً'
  }
  if (halalas > 0) {
    if (riyals > 0) result += ' و'
    result += convertNumber(halalas) + ' هللة'
  }

  return result + ' فقط لا غير'
}

/**
 * Convert a number to English words (Saudi Riyals)
 * Example: 37950.00 → "Thirty-seven thousand nine hundred and fifty Saudi Riyals only"
 */
export function numberToEnglishWords(amount: number): string {
  if (amount === 0) return 'Zero Saudi Riyals only'

  const riyals = Math.floor(amount)
  const halalas = Math.round((amount - riyals) * 100)

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five',
    'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
    'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ]
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
    'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ]

  function convertBelow1000(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) {
      const t = Math.floor(n / 10)
      const o = n % 10
      if (o === 0) return tens[t]
      return tens[t] + '-' + ones[o]
    }
    const h = Math.floor(n / 100)
    const remainder = n % 100
    if (remainder === 0) return ones[h] + ' Hundred'
    return ones[h] + ' Hundred and ' + convertBelow1000(remainder)
  }

  function convertNumber(n: number): string {
    if (n === 0) return ''

    if (n < 1000) return convertBelow1000(n)

    if (n < 1000000) {
      const thousands = Math.floor(n / 1000)
      const remainder = n % 1000
      const thousandWord = convertBelow1000(thousands) + ' Thousand'
      if (remainder === 0) return thousandWord
      return thousandWord + ' ' + convertBelow1000(remainder)
    }

    if (n < 1000000000) {
      const millions = Math.floor(n / 1000000)
      const remainder = n % 1000000
      const millionWord = convertBelow1000(millions) + ' Million'
      if (remainder === 0) return millionWord
      return millionWord + ' ' + convertNumber(remainder)
    }

    const billions = Math.floor(n / 1000000000)
    const remainder = n % 1000000000
    const billionWord = convertBelow1000(billions) + ' Billion'
    if (remainder === 0) return billionWord
    return billionWord + ' ' + convertNumber(remainder)
  }

  let result = ''
  if (riyals > 0) {
    result = convertNumber(riyals) + ' Saudi Riyals'
  }
  if (halalas > 0) {
    if (riyals > 0) result += ' and '
    result += convertNumber(halalas) + ' Halalas'
  }

  return result + ' only'
}
