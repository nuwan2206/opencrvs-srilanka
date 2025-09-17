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
  aggregateActionDeclarations,
  deepMerge,
  EventDocument,
  FieldUpdateValue,
  getPendingAction
} from '@opencrvs/toolkit/events'
import { applicationConfig } from '../application/application-config'
import { COUNTRY_LOGO_URL } from './constant'
import { GATEWAY_URL } from '@countryconfig/constants'
import { createClient } from '@opencrvs/toolkit/api'
import { Event } from '@countryconfig/form/types/types'
import { InformantType as BirthInformantType } from '@countryconfig/form/v2/birth/forms/pages/informant'
import { InformantTemplateType } from './sms-service'
import { generateFailureLog, NotificationParams, notify } from './handler'
import { InformantType as DeathInformantType } from '@countryconfig/form/v2/death/forms/pages/informant'
import { birthEvent } from '@countryconfig/form/v2/birth'
import { deathEvent } from '@countryconfig/form/v2/death'

const resolveName = (name: FieldUpdateValue) => {
  const nameObj = {
    firstname: '',
    middlename: '',
    surname: ''
  }
  if (name && typeof name === 'object') {
    if ('firstname' in name && typeof name.firstname === 'string') {
      nameObj.firstname = name.firstname
    }
    if ('middlename' in name && typeof name.middlename === 'string') {
      nameObj.middlename = name.middlename
    }
    if ('lastname' in name && typeof name.lastname === 'string') {
      nameObj.surname = name.lastname
    }
  }
  return {
    nameObj,
    fullName:
      `${nameObj.firstname} ${nameObj.middlename} ${nameObj.surname}`.trim()
  }
}

async function getLocations(token: string) {
  const url = new URL('events', GATEWAY_URL).toString()
  const client = createClient(url, `Bearer ${token}`)
  return client.locations.get.query()
}

function getInformant(eventType: string, declaration: Record<string, any>) {
  if (eventType === Event.Birth) {
    return declaration['informant.relation'] === BirthInformantType.MOTHER
      ? declaration['mother.name']
      : declaration['informant.relation'] === BirthInformantType.FATHER
        ? declaration['father.name']
        : declaration['informant.name']
  }

  if (eventType === Event.Death) {
    return declaration['informant.relation'] === DeathInformantType.SPOUSE
      ? declaration['spouse.name']
      : declaration['informant.name']
  }

  throw new Error('Invalid event type')
}

function getEventConfig(eventType: string) {
  if (eventType === Event.Birth) {
    return birthEvent
  }

  if (eventType === Event.Death) {
    return deathEvent
  }

  throw new Error('Invalid event type')
}

async function getNotificationParams(
  event: EventDocument,
  token: string,
  registrationNumber?: string
): Promise<NotificationParams> {
  const pendingAction = getPendingAction(event.actions)
  const locations = await getLocations(token)

  const declaration = deepMerge(
    aggregateActionDeclarations(event, getEventConfig(event.type)),
    pendingAction.declaration
  )

  const informant = getInformant(event.type, declaration)
  const { nameObj, fullName } = resolveName(informant)

  const informantEmail = declaration['informant.email']
  const informantMobile = declaration['informant.phoneNo']

  const recipient = {
    name: nameObj,
    email: typeof informantEmail === 'string' ? informantEmail : undefined,
    mobile: typeof informantMobile === 'string' ? informantMobile : undefined
  }

  const variables = {
    informantName: fullName,
    name: resolveName(
      event.type === Event.Birth
        ? declaration['child.name']
        : declaration['deceased.name']
    ).fullName,
    recipient,
    deliveryMethod: applicationConfig.INFORMANT_NOTIFICATION_DELIVERY_METHOD
  }

  const params = {
    variable: {
      trackingId: event.trackingId,
      crvsOffice:
        (locations ?? []).find(
          ({ id }) => id === pendingAction.createdAtLocation
        )?.name || '',
      registrationLocation: '',
      applicationName: applicationConfig.APPLICATION_NAME,
      countryLogo: COUNTRY_LOGO_URL,
      ...variables
    },
    recipient: variables.recipient,
    deliveryMethod: applicationConfig.INFORMANT_NOTIFICATION_DELIVERY_METHOD
  }

  if (pendingAction.type === ActionType.NOTIFY) {
    return {
      event:
        event.type === Event.Birth
          ? InformantTemplateType.birthInProgressNotification
          : InformantTemplateType.deathInProgressNotification,
      ...params
    }
  }

  if (pendingAction.type === ActionType.DECLARE) {
    return {
      event:
        event.type === Event.Birth
          ? InformantTemplateType.birthDeclarationNotification
          : InformantTemplateType.deathDeclarationNotification,
      ...params
    }
  }

  if (pendingAction.type === ActionType.REGISTER) {
    if (!registrationNumber) {
      const { mobile, email, name } = variables.recipient || {}
      generateFailureLog({
        contact: { mobile, email },
        name,
        event:
          event.type === Event.Birth
            ? InformantTemplateType.birthRegistrationNotification
            : InformantTemplateType.deathRegistrationNotification,
        reason: 'registration number being missing'
      })

      throw new Error('Registration number is missing')
    }

    return {
      event:
        event.type === Event.Birth
          ? InformantTemplateType.birthRegistrationNotification
          : InformantTemplateType.deathRegistrationNotification,
      ...params,
      variable: { ...params.variable, registrationNumber }
    }
  }

  if (pendingAction.type === ActionType.REJECT) {
    return {
      event:
        event.type === Event.Birth
          ? InformantTemplateType.birthRejectionNotification
          : InformantTemplateType.deathRejectionNotification,
      ...params
    }
  }

  throw new Error(`Invalid action type "${pendingAction.type}"`)
}

export async function sendInformantNotification({
  event,
  token,
  registrationNumber
}: {
  event: EventDocument
  token: string
  registrationNumber?: string
}) {
  try {
    const notificationParams = await getNotificationParams(
      event,
      token,
      registrationNumber
    )

    await notify(notificationParams)
  } catch (error) {
    console.log(error)
  }
}
