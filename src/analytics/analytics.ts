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

import { applicationConfig } from '@countryconfig/api/application/application-config'
import { tennisClubMembershipEvent } from '@countryconfig/form/tennis-club-membership'
import { Event } from '@countryconfig/form/types/types'
import { birthEvent } from '@countryconfig/form/v2/birth'
import { deathEvent } from '@countryconfig/form/v2/death'
import { logger } from '@countryconfig/logger'
import {
  ActionConfig,
  ActionDocument,
  ActionStatus,
  ActionType,
  EventConfig,
  EventDocument,
  EventState,
  getActionAnnotationFields,
  getCurrentEventState
} from '@opencrvs/toolkit/events'
import { differenceInDays } from 'date-fns'
import { ExpressionBuilder, Kysely } from 'kysely'
import { chunk, pickBy } from 'lodash'
import { getClient } from './postgres'
import { getStatistics } from '@countryconfig/utils'

/**
 * You can control which events you want to track in analytics by adding them here.
 */
function findEventConfig(eventType: string) {
  if (eventType === Event.Birth) {
    return birthEvent
  }

  if (eventType === Event.TENNIS_CLUB_MEMBERSHIP) {
    return tennisClubMembershipEvent
  }

  if (eventType === Event.Death) {
    return deathEvent
  }

  return null
}

/**
 * Only analytics fields (`analytics: true`) must be included in `declaration`
 */
function pickDeclarationAnalyticsFields(
  declaration: EventState,
  eventConfig: EventConfig
) {
  const analyticsFields = eventConfig.declaration.pages.flatMap((page) =>
    page.fields.filter((field) => field.analytics === true)
  )

  return pickBy(declaration, (_, key) =>
    analyticsFields.some((field) => field.id === key)
  )
}

function pickAnnotationAnalyticsFields(
  annotation: Record<string, any>,
  actionConfig: ActionConfig
) {
  const fields = getActionAnnotationFields(actionConfig)

  const analyticsFields = fields.filter((field) => field.analytics === true)

  return pickBy(annotation, (_, key) =>
    analyticsFields.some((field) => field.id === key)
  )
}

function getAnnotation(
  action: ActionDocument,
  actions: EventDocument['actions']
) {
  const originalAction = actions.find((a) => a.id === action.originalActionId)
  const originalAnnotation =
    originalAction && 'annotation' in originalAction
      ? originalAction.annotation
      : {}
  const actionAnnotation = 'annotation' in action ? action.annotation : {}
  return {
    ...originalAnnotation,
    ...actionAnnotation
  }
}

function precalculateAdditionalAnalytics(
  action: ActionDocument,
  declaration: ActionDocument['declaration'],
  eventConfig: EventConfig
) {
  /*
   * Example: precalculate age from action creation date and child's date of birth
   */

  if (eventConfig.id === Event.Birth) {
    const createdAt = new Date(action.createdAt)
    const childDoB = declaration['child.dob']
    if (!childDoB) return action

    return {
      ...declaration,
      'child.age.days': differenceInDays(
        createdAt,
        new Date(childDoB as string)
      )
    }
  }

  return declaration
}

function convertDotKeysToUnderscore(
  obj: Record<string, any>
): Record<string, any> {
  const newObj: Record<string, any> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = key.replace(/\./g, '_')
      newObj[newKey] = obj[key]
    }
  }
  return newObj
}

export async function upsertAnalyticsEventActions(
  event: EventDocument,
  eventConfig: EventConfig,
  trx: Kysely<any>
) {
  for (let i = 0; i < event.actions.length; i++) {
    const actionsFromStartToCurrentPoint = event.actions
      .sort((a, b) => {
        // CREATE type always comes first
        if (a.type === ActionType.CREATE && b.type !== ActionType.CREATE)
          return -1
        if (b.type === ActionType.CREATE && a.type !== ActionType.CREATE)
          return 1
        // Otherwise sort by createdAt
        return a.createdAt.localeCompare(b.createdAt)
      })
      .slice(0, i + 1)

    const action = event.actions[i]

    const actionAtCurrentPoint = getCurrentEventState(
      {
        ...event,
        actions: actionsFromStartToCurrentPoint
      },
      eventConfig
    )

    const { type, ...act } = action

    if (
      action.status === ActionStatus.Requested ||
      action.status === ActionStatus.Rejected
    ) {
      continue
    }

    const actionConfig = eventConfig.actions.find((a) => a.type === type)

    const annotation = actionConfig
      ? pickAnnotationAnalyticsFields(
          getAnnotation(action, event.actions),
          actionConfig
        )
      : {}

    const actions = event.actions
    /*
     * Add date of declaration and date of registration to all events for each access
     */
    const declareAction = actions.find((a) => a.type === ActionType.DECLARE)
    const registerAction = actions.find((a) => a.type === ActionType.REGISTER)

    const actionWithFilteredDeclaration = {
      ...act,
      eventId: event.id,
      actionType: type,
      eventType: event.type,
      declaredAt: declareAction ? declareAction.createdAt : null,
      registeredAt: registerAction ? registerAction.createdAt : null,
      annotation: convertDotKeysToUnderscore(annotation),
      declaration: convertDotKeysToUnderscore(
        precalculateAdditionalAnalytics(
          action,
          pickDeclarationAnalyticsFields(
            actionAtCurrentPoint.declaration,
            eventConfig
          ),
          eventConfig
        )
      )
    }

    await trx
      .insertInto('analytics.event_actions')
      .values(actionWithFilteredDeclaration)
      .onConflict((oc) =>
        oc.columns(['id']).doUpdateSet(actionWithFilteredDeclaration)
      )
      .execute()
  }
}

export async function importEvent(event: EventDocument, trx: Kysely<any>) {
  const eventConfig = findEventConfig(event.type)

  if (!eventConfig) {
    logger.warn(
      `Event with id "${event.id}" has unsupported event type "${event.type}". Record will not be written in the analytics database.`
    )
    return
  }

  await upsertAnalyticsEventActions(event, eventConfig, trx)
  logger.info(`Event with id "${event.id}" logged into analytics`)
}

export async function importEvents(events: EventDocument[], trx: Kysely<any>) {
  for (const event of events) {
    await importEvent(event, trx)
  }
}

export async function syncLocationLevels() {
  const adminLevels = applicationConfig.ADMIN_STRUCTURE
  const client = getClient()
  await client.transaction().execute(async (trx) => {
    return trx
      .insertInto('analytics.location_levels')
      .values(
        adminLevels.map((level, index) => ({
          id: level.id,
          level: index + 1,
          name: level.label.defaultMessage
        }))
      )
      .onConflict((oc) =>
        oc
          .column('id')
          .doUpdateSet(
            (eb: ExpressionBuilder<any, 'analytics.location_levels'>) => ({
              name: eb.ref('excluded.name'),
              level: eb.ref('excluded.level')
            })
          )
      )
      .execute()
  })
}

const INSERT_MAX_CHUNK_SIZE = 1000

export async function syncLocationStatistics() {
  const client = getClient()
  const statistics = await getStatistics()

  const flattenedStats = statistics.flatMap((stat) =>
    stat.years.map((year) => ({
      name: stat.name,
      reference_id: stat.id,
      year: year.year,
      crude_birth_rate: year.crude_birth_rate,
      male_population: year.male_population,
      female_population: year.female_population,
      total_population: year.population
    }))
  )

  await client.transaction().execute(async (trx) => {
    for (const [index, batch] of chunk(
      flattenedStats,
      INSERT_MAX_CHUNK_SIZE
    ).entries()) {
      logger.info(
        `Processing ${Math.min((index + 1) * INSERT_MAX_CHUNK_SIZE, flattenedStats.length)}/${flattenedStats.length} location statistics`
      )

      await trx
        .insertInto('analytics.location_statistics')
        .values(batch)
        .onConflict((oc) =>
          oc
            .columns(['reference_id', 'year'])
            .doUpdateSet(
              (
                eb: ExpressionBuilder<any, 'analytics.location_statistics'>
              ) => ({
                year: eb.ref('excluded.year'),
                crude_birth_rate: eb.ref('excluded.crude_birth_rate'),
                male_population: eb.ref('excluded.male_population'),
                female_population: eb.ref('excluded.female_population'),
                total_population: eb.ref('excluded.total_population')
              })
            )
        )
        .execute()
    }
  })
}
