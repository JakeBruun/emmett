import {
  DeciderCommandHandler,
  STREAM_DOES_NOT_EXIST,
  assertNotEmptyString,
  assertPositiveNumber,
  assertUnsignedBigInt,
  type EventStore,
} from '@event-driven-io/emmett';
import { type Request, type Response, type Router } from 'express';
import {
  Created,
  NoContent,
  getETagFromIfMatch,
  getWeakETagValue,
  on,
  setETag,
  toWeakETag,
} from '../../';
import { decider } from './businessLogic';
import { type PricedProductItem, type ProductItem } from './shoppingCart';

export const handle = DeciderCommandHandler(decider);

const dummyPriceProvider = (_productId: string) => {
  return 100;
};

export const getExpectedStreamVersion = (request: Request): bigint => {
  const eTag = getETagFromIfMatch(request);
  const weakEtag = getWeakETagValue(eTag);

  return assertUnsignedBigInt(weakEtag);
};

export const shoppingCartApi = (eventStore: EventStore) => (router: Router) => {
  // Open Shopping cart
  router.post(
    '/clients/:clientId/shopping-carts/',
    on(async (request: Request) => {
      const clientId = assertNotEmptyString(request.params.clientId);
      const shoppingCartId = clientId;

      const result = await handle(
        eventStore,
        shoppingCartId,
        {
          type: 'OpenShoppingCart',
          data: { clientId, shoppingCartId, now: new Date() },
        },
        { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
      );

      return Created({
        createdId: shoppingCartId,
        eTag: toWeakETag(result.nextExpectedStreamVersion),
      });
    }),
  );

  router.post(
    '/clients/:clientId/shopping-carts/:shoppingCartId/product-items',
    on(async (request: AddProductItemRequest) => {
      const shoppingCartId = assertNotEmptyString(
        request.params.shoppingCartId,
      );
      const productItem: ProductItem = {
        productId: assertNotEmptyString(request.body.productId),
        quantity: assertPositiveNumber(request.body.quantity),
      };
      const unitPrice = dummyPriceProvider(productItem.productId);

      const result = await handle(
        eventStore,
        shoppingCartId,
        {
          type: 'AddProductItemToShoppingCart',
          data: {
            shoppingCartId,
            productItem: { ...productItem, unitPrice },
          },
        },
        { expectedStreamVersion: getExpectedStreamVersion(request) },
      );

      return NoContent({ eTag: toWeakETag(result.nextExpectedStreamVersion) });
    }),
  );

  // Remove Product Item
  router.delete(
    '/clients/:clientId/shopping-carts/:shoppingCartId/product-items',
    on(async (request: Request) => {
      const shoppingCartId = assertNotEmptyString(
        request.params.shoppingCartId,
      );
      const productItem: PricedProductItem = {
        productId: assertNotEmptyString(request.query.productId),
        quantity: assertPositiveNumber(Number(request.query.quantity)),
        unitPrice: assertPositiveNumber(Number(request.query.unitPrice)),
      };

      const result = await handle(
        eventStore,
        shoppingCartId,
        {
          type: 'RemoveProductItemFromShoppingCart',
          data: { shoppingCartId, productItem },
        },
        { expectedStreamVersion: getExpectedStreamVersion(request) },
      );

      return NoContent({ eTag: toWeakETag(result.nextExpectedStreamVersion) });
    }),
  );

  // Confirm Shopping Cart
  router.post(
    '/clients/:clientId/shopping-carts/:shoppingCartId/confirm',
    async (request: Request, response: Response) => {
      const shoppingCartId = assertNotEmptyString(
        request.params.shoppingCartId,
      );

      const result = await handle(
        eventStore,
        shoppingCartId,
        {
          type: 'ConfirmShoppingCart',
          data: { shoppingCartId, now: new Date() },
        },
        { expectedStreamVersion: getExpectedStreamVersion(request) },
      );

      setETag(response, toWeakETag(result.nextExpectedStreamVersion));
      response.sendStatus(204);
    },
  );

  // Cancel Shopping Cart
  router.delete(
    '/clients/:clientId/shopping-carts/:shoppingCartId',
    async (request: Request, response: Response) => {
      const shoppingCartId = assertNotEmptyString(
        request.params.shoppingCartId,
      );

      const result = await handle(
        eventStore,
        shoppingCartId,
        {
          type: 'CancelShoppingCart',
          data: { shoppingCartId, now: new Date() },
        },
        { expectedStreamVersion: getExpectedStreamVersion(request) },
      );

      setETag(response, toWeakETag(result.nextExpectedStreamVersion));
      response.sendStatus(204);
    },
  );
};

// Add Product Item
type AddProductItemRequest = Request<
  Partial<{ shoppingCartId: string }>,
  unknown,
  Partial<{ productId: number; quantity: number }>
>;