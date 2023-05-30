use access_control::AccessControl;
use borsh::{BorshDeserialize, BorshSerialize};
use hyperlane_core::H256;
use hyperlane_sealevel_mailbox::instruction::{
    Instruction as MailboxInstruction, OutboxDispatch as MailboxOutboxDispatch,
};
use solana_program::{
    account_info::AccountInfo,
    instruction::{AccountMeta, Instruction},
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use std::collections::HashMap;

use crate::{HyperlaneConnectionClient, HyperlaneConnectionClientRecipient};

/// Configuration for a remote router.
#[derive(Debug, Clone, PartialEq, BorshDeserialize, BorshSerialize)]
pub struct RemoteRouterConfig {
    /// The domain of the remote router.
    pub domain: u32,
    /// The remote router.
    pub router: Option<H256>,
}

pub trait HyperlaneRouter {
    fn router(&self, origin: u32) -> Option<&H256>;

    fn only_remote_router(&self, origin: u32, maybe_router: &H256) -> Result<(), ProgramError> {
        if !self.is_remote_router(origin, maybe_router) {
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(())
    }

    fn enroll_remote_router(&mut self, config: RemoteRouterConfig);

    fn enroll_remote_routers(&mut self, configs: Vec<RemoteRouterConfig>) {
        for config in configs {
            self.enroll_remote_router(config);
        }
    }

    fn is_remote_router(&self, origin: u32, maybe_router: &H256) -> bool {
        self.router(origin) == Some(maybe_router)
    }
}

pub trait HyperlaneRouterAccessControl: HyperlaneRouter + AccessControl {
    fn enroll_remote_router_only_owner(
        &mut self,
        maybe_owner: &AccountInfo,
        config: RemoteRouterConfig,
    ) -> Result<(), ProgramError> {
        self.ensure_owner_signer(maybe_owner)?;
        self.enroll_remote_router(config);
        Ok(())
    }

    fn enroll_remote_routers_only_owner(
        &mut self,
        maybe_owner: &AccountInfo,
        configs: Vec<RemoteRouterConfig>,
    ) -> Result<(), ProgramError> {
        self.ensure_owner_signer(maybe_owner)?;
        self.enroll_remote_routers(configs);
        Ok(())
    }
}

pub trait HyperlaneRouterDispatch: HyperlaneRouter + HyperlaneConnectionClient {
    fn dispatch(
        &self,
        program_id: &Pubkey,
        dispatch_authority_seeds: &[&[u8]],
        destination_domain: u32,
        message_body: Vec<u8>,
        account_metas: Vec<AccountMeta>,
        account_infos: &[AccountInfo],
    ) -> Result<(), ProgramError> {
        // The recipient is the remote router, which must be enrolled.
        let recipient = *self
            .router(destination_domain)
            .ok_or(ProgramError::InvalidArgument)?;

        let dispatch_instruction = MailboxInstruction::OutboxDispatch(MailboxOutboxDispatch {
            sender: *program_id,
            destination_domain,
            recipient,
            message_body,
        });
        let mailbox_ixn = Instruction {
            program_id: *self.mailbox(),
            data: dispatch_instruction.into_instruction_data()?,
            accounts: account_metas,
        };
        // Call the Mailbox program to dispatch the message.
        invoke_signed(&mailbox_ixn, account_infos, &[dispatch_authority_seeds])
    }
}

pub trait HyperlaneRouterMessageRecipient:
    HyperlaneRouter + HyperlaneConnectionClientRecipient
{
    /// Returns Err if `maybe_mailbox_process_authority` is not a signer or is not the
    /// Mailbox's process authority for this recipient, or if the sender is not the
    /// remote router for the provided origin.
    fn ensure_valid_router_message(
        &self,
        maybe_mailbox_process_authority: &AccountInfo,
        origin: u32,
        sender: &H256,
    ) -> Result<(), ProgramError> {
        // First ensure that the Mailbox's process authority for this recipient
        // is a signer.
        self.ensure_mailbox_process_authority_signer(maybe_mailbox_process_authority)?;

        // Now make sure the sender is really a remote router.
        self.only_remote_router(origin, sender)
    }
}

/// A default implementation of `HyperlaneRouter` for `HashMap<u32, H256>`.
impl HyperlaneRouter for HashMap<u32, H256> {
    fn router(&self, origin: u32) -> Option<&H256> {
        self.get(&origin)
    }

    fn enroll_remote_router(&mut self, config: RemoteRouterConfig) {
        match config.router {
            Some(router) => {
                self.insert(config.domain, router);
            }
            None => {
                self.remove(&config.domain);
            }
        }

        msg!(
            "Set domain {} remote router to {:?}",
            config.domain,
            config.router
        );
    }
}
