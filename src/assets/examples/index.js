import manipulation from './example-manipulation.json'
import classification from './example-classification.json'
import autoencoder from './example-autoencoder.json'

const examples = [
  { key: 'autoencoder', label: 'Autoencoder', data: autoencoder },
  { key: 'classifier', label: 'Classification', data: classification },
  { key: 'manipulation', label: 'Manipulation', data: manipulation },
]

export default examples
