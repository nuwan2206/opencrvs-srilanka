/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * OpenCRVS is also distributed under the terms of the Civil Registration
 * & Healthcare Disclaimer located at http://opencrvs.org/license.
 *
 * Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.
 */
import {
  ActionType,
  ConditionalType,
  defineConfig,
  field
} from '@opencrvs/toolkit/events'
import {
  BIRTH_DECLARATION_FORM,
  BIRTH_DECLARATION_REVIEW
} from './forms/declaration'
import { advancedSearchBirth } from './advancedSearch'
import { Event } from '@countryconfig/form/types/types'
import { BIRTH_CERTIFICATE_COLLECTOR_FORM } from './forms/printForm'
import { PlaceOfBirth } from './forms/pages/child'
import { CORRECTION_FORM } from './forms/correctionForm'
import { dedupConfig } from './dedupConfig'

export const birthEvent = defineConfig({
  id: Event.Birth,
  declaration: BIRTH_DECLARATION_FORM,
  label: {
    defaultMessage: 'Birth',
    description: 'This is what this event is referred as in the system',
    id: 'event.birth.label'
  },
  dateOfEvent: field('child.dob'),
  title: {
    defaultMessage: '{child.name.firstname} {child.name.surname}',
    description: 'This is the title of the summary',
    id: 'event.birth.title'
  },
  fallbackTitle: {
    id: 'event.tennis-club-membership.fallbackTitle',
    defaultMessage: 'No name provided',
    description:
      'This is a fallback title if actual title resolves to empty string'
  },
  summary: {
    fields: [
      {
        fieldId: 'child.dob',
        emptyValueMessage: {
          defaultMessage: 'No date of birth',
          description: 'This is shown when there is no child information',
          id: 'event.birth.summary.child.dob.empty'
        }
      },
      // Render the 'fallback value' when selection has not been made.
      // This hides the default values of the field when no selection has been made. (e.g. when address is prefilled with user's details, we don't want to show the address before selecting the option)
      {
        fieldId: 'child.placeOfBirth',
        emptyValueMessage: {
          defaultMessage: 'No place of birth',
          description: 'This is shown when there is no child information',
          id: 'event.birth.summary.child.placeOfBirth.empty'
        },
        label: {
          defaultMessage: 'Place of birth',
          description: 'Label for place of birth',
          id: 'event.birth.summary.child.placeOfBirth.label'
        },
        conditionals: [
          {
            type: ConditionalType.SHOW,
            conditional: field('child.placeOfBirth').isFalsy()
          }
        ]
      },
      {
        fieldId: 'child.birthLocation',
        emptyValueMessage: {
          defaultMessage: 'No place of birth',
          description: 'This is shown when there is no child information',
          id: 'event.birth.summary.child.placeOfBirth.empty'
        },
        label: {
          defaultMessage: 'Place of birth',
          description: 'Label for place of birth',
          id: 'event.birth.summary.child.placeOfBirth.label'
        },
        conditionals: [
          {
            type: ConditionalType.SHOW,
            conditional: field('child.placeOfBirth').isEqualTo(
              PlaceOfBirth.HEALTH_FACILITY
            )
          }
        ]
      },
      {
        fieldId: 'child.address.privateHome',
        emptyValueMessage: {
          defaultMessage: 'No place of birth',
          description: 'This is shown when there is no child information',
          id: 'event.birth.summary.child.placeOfBirth.empty'
        },
        label: {
          defaultMessage: 'Place of birth',
          description: 'Label for place of birth',
          id: 'event.birth.summary.child.placeOfBirth.label'
        },
        conditionals: [
          {
            type: ConditionalType.SHOW,
            conditional: field('child.placeOfBirth').isEqualTo(
              PlaceOfBirth.PRIVATE_HOME
            )
          }
        ]
      },
      {
        fieldId: 'child.address.other',
        emptyValueMessage: {
          defaultMessage: 'No place of birth',
          description: 'This is shown when there is no child information',
          id: 'event.birth.summary.child.placeOfBirth.empty'
        },
        label: {
          defaultMessage: 'Place of birth',
          description: 'Label for place of birth',
          id: 'event.birth.summary.child.placeOfBirth.label'
        },
        conditionals: [
          {
            type: ConditionalType.SHOW,
            conditional: field('child.placeOfBirth').isEqualTo(
              PlaceOfBirth.OTHER
            )
          }
        ]
      },
      {
        id: 'informant.contact',
        emptyValueMessage: {
          defaultMessage: 'No contact details provided',
          description: 'This is shown when there is no informant information',
          id: 'event.birth.summary.informant.contact.empty'
        },
        label: {
          defaultMessage: 'Contact',
          description: 'This is the label for the informant information',
          id: 'event.birth.summary.informant.contact.label'
        },
        value: {
          defaultMessage: '{informant.phoneNo} {informant.email}',
          description: 'This is the contact value of the informant',
          id: 'event.birth.summary.informant.contact.value'
        }
      }
    ]
  },
  actions: [
    {
      type: ActionType.READ,
      label: {
        defaultMessage: 'Read',
        description:
          'This is shown as the action name anywhere the user can trigger the action from',
        id: 'event.birth.action.Read.label'
      },
      review: BIRTH_DECLARATION_REVIEW
    },
    {
      type: ActionType.DECLARE,
      label: {
        defaultMessage: 'Declare',
        description:
          'This is shown as the action name anywhere the user can trigger the action from',
        id: 'event.birth.action.declare.label'
      },
      review: BIRTH_DECLARATION_REVIEW,
      deduplication: {
        id: 'birth-deduplication',
        label: {
          defaultMessage: 'Detect duplicate',
          description:
            'This is shown as the action name anywhere the user can trigger the action from',
          id: 'event.birth.action.detect-duplicate.label'
        },
        query: dedupConfig
      }
    },
    {
      type: ActionType.VALIDATE,
      label: {
        defaultMessage: 'Validate',
        description:
          'This is shown as the action name anywhere the user can trigger the action from',
        id: 'event.birth.action.validate.label'
      },
      review: BIRTH_DECLARATION_REVIEW,
      deduplication: {
        id: 'birth-deduplication',
        label: {
          defaultMessage: 'Detect duplicate',
          description:
            'This is shown as the action name anywhere the user can trigger the action from',
          id: 'event.birth.action.detect-duplicate.label'
        },
        query: dedupConfig
      }
    },
    {
      type: ActionType.REGISTER,
      label: {
        defaultMessage: 'Register',
        description:
          'This is shown as the action name anywhere the user can trigger the action from',
        id: 'event.birth.action.register.label'
      },
      review: BIRTH_DECLARATION_REVIEW,
      deduplication: {
        id: 'birth-deduplication',
        label: {
          defaultMessage: 'Detect duplicate',
          description:
            'This is shown as the action name anywhere the user can trigger the action from',
          id: 'event.birth.action.detect-duplicate.label'
        },
        query: dedupConfig
      }
    },
    {
      type: ActionType.PRINT_CERTIFICATE,
      label: {
        defaultMessage: 'Print certificate',
        description:
          'This is shown as the action name anywhere the user can trigger the action from',
        id: 'event.birth.action.collect-certificate.label'
      },
      printForm: BIRTH_CERTIFICATE_COLLECTOR_FORM
    },
    {
      type: ActionType.REQUEST_CORRECTION,
      label: {
        id: 'event.birth.action.declare.form.review.title',
        defaultMessage:
          '{child.name.firstname, select, __EMPTY__ {Birth declaration} other {{child.name.surname, select, __EMPTY__ {Birth declaration for {child.name.firstname}} other {Birth declaration for {child.name.firstname} {child.name.surname}}}}}',
        description: 'Title of the form to show in review page'
      },
      correctionForm: CORRECTION_FORM
    }
  ],
  advancedSearch: advancedSearchBirth
})
