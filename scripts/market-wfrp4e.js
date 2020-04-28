/**
 * WIP
 * This class contains functions and helpers related to the market and Pay system
 */
class MarketWfrp4e 
{
    /**
     * Roll a test for the availability and the stock quantity of an item based on the rulebook
     * Takes as a parameter an object with localized settlement type, localized rarity and a modifier for the roll
     * @param {Object} options settlement, rarity, modifier 
     */
    static testForAvailability({settlement, rarity, modifier})
    {
      //This method read the table WFRP4E.availabilityTable defined in the config file

      //First we get the different settlements size
      let validSettlements = Object.getOwnPropertyNames(WFRP4E.availabilityTable);
      let validSettlementsLocalized = {};
      let validRarityLocalized = {};

      //For each settlements we found in the config, we try to translate them and we build a correlation table
      validSettlements.forEach(function(index){
        validSettlementsLocalized[game.i18n.localize(index).toLowerCase()] = index;
      });

      //If we found a valid settlement size, we now do the same thing for the rarity datas
      if(settlement && validSettlementsLocalized.hasOwnProperty(settlement))
      {
        let validRarity = Object.getOwnPropertyNames(WFRP4E.availabilityTable[validSettlementsLocalized[settlement]]);
        validRarity.forEach(function(index){
          validRarityLocalized[game.i18n.localize(index).toLowerCase()] = index;
        });
      }

      let msg = `<h3><b>${game.i18n.localize("MARKET.AvailabilityTest")}</b></h3>`;

      //If at least one of the args isnt specified or if the specified options are not valid, we give informations on the correct syntax
      if(!settlement || !rarity || !validSettlementsLocalized.hasOwnProperty(settlement) || !validRarityLocalized.hasOwnProperty(rarity))
      {
        msg += `<p>${game.i18n.localize("MARKET.AvailWrongCommand")}</p><p><i>${game.i18n.localize("MARKET.AvailCommandExample")}</i></p>`;
      }
      //Everything is ok, lets roll for availability
      else
      {
        let roll = new Roll("1d100 - @modifier",{modifier:modifier}).roll();
        //we retrieve the correct line
        let availabilityLookup = WFRP4E.availabilityTable[validSettlementsLocalized[settlement]][validRarityLocalized[rarity]];
        let isAvailable = availabilityLookup.test > 0 && roll.total <= availabilityLookup.test;

        let finalResult = {
          settlement:settlement.charAt(0).toUpperCase() + settlement.slice(1),
          rarity:rarity.charAt(0).toUpperCase() + rarity.slice(1),
          instock: isAvailable ? game.i18n.localize("Yes"):game.i18n.localize("No"),
          quantity: isAvailable ? availabilityLookup.stock:0,
          roll:roll.total
        };

        //We roll the stock if we detect a valid roll value
        if(availabilityLookup.stock.includes("d"))
        {
          let stockRoll = new Roll(availabilityLookup.stock).roll();
          finalResult.quantity = stockRoll.total;
        }

        //Format the message before sending it back to chat
        msg += this.formatTestForChat(finalResult);
      }
      ChatMessage.create(WFRP_Utility.chatDataSetup(msg,"roll",true));
    }

    /**
     * Format an availability test before sending it to chat
     * @param {Object} result 
     */
    static formatTestForChat(result)
    {
      return `
        <b>${game.i18n.localize("MARKET.SettlementSize")}</b> ${result.settlement}<br>
        <b>${game.i18n.localize("MARKET.Rarity")}</b> ${result.rarity}<br><br>
        <b>${game.i18n.localize("MARKET.InStock")}</b> ${result.instock}<br>
        <b>${game.i18n.localize("MARKET.QuantityAvailable")}</b> ${result.quantity}<br>
        <b>${game.i18n.localize("Roll")}:</b> ${result.roll}
      `;
    }

    /**
     * Send a whispered card menu to the player to start an availability test
     * The card let him choose a settlement size
     * @param {String} rarity 
     */
    static generateSettlementChoice(rarity)
    {
      let cardData = {rarity:WFRP4E.availability[rarity]};
      renderTemplate("systems/wfrp4e/templates/chat/market-settlement.html", cardData).then(html => {
        let chatData = WFRP_Utility.chatDataSetup(html,"selfroll");
        ChatMessage.create(chatData);
      });
    }

    /**
     * Consolidate every money the player has in order to give him the fewer coins possible
     * @param {Array} money 
     */
    static consolidateMoney(money)
    {
      //We sort the money from the highest BP value to the lowest (so gc => ss => bp)
      //This allow us to deal with custom money too and to not be dependent on the money name (translation errors could break the code otherwise)
      money.sort((a,b)=>b.data.coinValue.value - a.data.coinValue.value);
  
      let brass = 0;
      //First we calculate the BP value
      for (let m of money)
        brass += m.data.quantity.value * m.data.coinValue.value;
      
      //Then we consolidate the coins
      for (let m of money)
      {
        //We don't know what players could create as a custom money and we dont want to divide by zero, ever. It would kill a kitten somewhere, probably.
        if(m.data.coinValue.value <= 0)
          break;
        m.data.quantity.value = Math.trunc(brass / m.data.coinValue.value);
        brass = brass % m.data.coinValue.value;
      }
  
      return money;
    }
    /**
     * Execute a /pay command and remove the money from the player inventory 
     * @param {String} command 
     * @param {Array} moneyItemInventory
     */
    static payCommand(command, moneyItemInventory)
    {
      //First we parse the command
      let moneyToPay = this.parsePayString(command);
      let msg = `<h3><b>${game.i18n.localize("MARKET.PayCommand")}</b></h3>`;
      let errorOccured = false;
      //Wrong command
      if(!moneyToPay)
      {
        msg += `<p>${game.i18n.localize("MARKET.PayWrongCommand")}</p><p><i>${game.i18n.localize("MARKET.PayCommandExample")}</i></p>`;
        errorOccured=true;
      }
      //Command is ok, let's try to pay
      else
      {
        //We need to get the character money items for gc, ss and bp. This is a "best effort" lookup method. If it fails, we stop the command to prevent any data loss.
        let moneyTypeIndex = {
          gc:false,
          ss:false,
          bp:false
        }
        //First we'll try to look at the localized name
        for(let m = 0; m < moneyItemInventory.length; m++)
        {
          switch(moneyItemInventory[m].name)
          {
            case game.i18n.localize("NAME.GC"):
              moneyTypeIndex.gc = m;
              break;
            case game.i18n.localize("NAME.SS"):
              moneyTypeIndex.ss = m;
              break;
            case game.i18n.localize("NAME.BP"):
              moneyTypeIndex.bp = m;
              break;
          }
        }
        //Then we'll try to look for the coin value equals to the gc/ss/bp coin value for any entry that wasn't found.
        //This allows for a better chance at detecting the money items, as they are currently not properly identified by a unique id. Meaning if a translation module made a typo in the compendium
        //or if a player/gm edit the name of the money items for any reasons, it would not be found by the first method
        for(let m = 0; m < moneyItemInventory.length; m++)
        {
          switch(moneyItemInventory[m].data.coinValue.value)
          {
            case 240://gc
              if(moneyTypeIndex.gc === false)
                moneyTypeIndex.gc = m;
              break;
            case 12://ss
              if(moneyTypeIndex.ss === false)
                moneyTypeIndex.ss = m;
              break;
            case 1://bp
              if(moneyTypeIndex.bp === false)
                moneyTypeIndex.bp = m;
              break;
          }
        }
        //If one money is missing, we stop here before doing anything bad
        if(Object.values(moneyTypeIndex).includes(false))
        {
          msg += `<p>${game.i18n.localize("MARKET.CantFindMoneyItems")}</p>`;
          errorOccured=true;
        }
        else
        {
          //Now its time to check if the actor has enough money to pay
          //We'll start by trying to pay without consolidating the money
          if(moneyToPay.gc <= moneyItemInventory[moneyTypeIndex.gc].data.quantity.value &&
            moneyToPay.ss <= moneyItemInventory[moneyTypeIndex.ss].data.quantity.value &&
            moneyToPay.bp <= moneyItemInventory[moneyTypeIndex.bp].data.quantity.value)
          {
            //Great, we can just deduce the quantity for each money
            moneyItemInventory[moneyTypeIndex.gc].data.quantity.value -= moneyToPay.gc;
            moneyItemInventory[moneyTypeIndex.ss].data.quantity.value -= moneyToPay.ss;
            moneyItemInventory[moneyTypeIndex.bp].data.quantity.value -= moneyToPay.bp;
          }
          else //We'll need to calculate the brass value on both the pay command and the actor inventory, and then consolidate
          {
            let totalBPAvailable = 0;
            for (let m of moneyItemInventory)
              totalBPAvailable += m.data.quantity.value * m.data.coinValue.value;

            let totalBPPay = moneyToPay.gc*240+moneyToPay.ss*12+moneyToPay.bp;

            //Does we have enough money in the end?
            if(totalBPAvailable < totalBPPay)
            {
              //No
              msg += `${game.i18n.localize("MARKET.NotEnoughMoney")}<br>
              <b>${game.i18n.localize("MARKET.MoneyNeeded")}</b> ${totalBPPay} ${game.i18n.localize("NAME.BP")}<br>
              <b>${game.i18n.localize("MARKET.MoneyAvailable")}</b> ${totalBPAvailable} ${game.i18n.localize("NAME.BP")}`;
              errorOccured=true;
            }
            else //Yes!
            {
              totalBPAvailable -= totalBPPay;
              moneyItemInventory[moneyTypeIndex.gc].data.quantity.value = 0;
              moneyItemInventory[moneyTypeIndex.ss].data.quantity.value = 0;
              moneyItemInventory[moneyTypeIndex.bp].data.quantity.value = totalBPAvailable;
              
              //Then we consolidate
              moneyItemInventory = this.consolidateMoney(moneyItemInventory);
            }
          }
        }
      }
      if(errorOccured)
        moneyItemInventory = false;
      else
      {
        msg += game.i18n.format("MARKET.Paid",{number1:moneyToPay.gc,number2:moneyToPay.ss,number3:moneyToPay.bp});
        msg += `<br><b>${game.i18n.localize("MARKET.PaidBy")}</b> ${game.user.character.name}`;
      }
      ChatMessage.create(WFRP_Utility.chatDataSetup(msg,"roll"));
      return moneyItemInventory;
    }

    /**
     * Parse a price string
     * Like "8gc6bp" or "74ss 12gc", etc
     * This method use localized abbreviations
     * return an object with the moneys and quantity
     * @param {String} string 
     * @returns {Object}
     */
    static parsePayString(string)
    {
      //Regular expression to match any number followed by any abbreviation. Ignore whitespaces
      const expression = /((\d+)\s?([a-zA-Z]+))/g;
      let matches = [...string.matchAll(expression)];

      let payRecap = {
        gc: 0,
        ss: 0,
        bp: 0
      };
      let isValid = matches.length;
      for(let match of matches)
      {
        //Check if we have a valid command. We should have 4 groups per match
        if(match.length != 4)
        {
          isValid = false;
          break;
        }
        //Should contains the abbreviated money (like "gc")
        switch(match[3].toLowerCase())
        {
          case game.i18n.localize("MARKET.Abbrev.GC").toLowerCase():
            payRecap.gc += parseInt(match[2],10);
            break;
          case game.i18n.localize("MARKET.Abbrev.SS").toLowerCase():
            payRecap.ss += parseInt(match[2],10);
            break;
          case game.i18n.localize("MARKET.Abbrev.BP").toLowerCase():
            payRecap.bp += parseInt(match[2],10);
            break;
        }
      }
      if(isValid && (payRecap.gc + payRecap.ss + payRecap.bp == 0))
        isValid = false;
      return isValid ? payRecap:false;
    }

    /**
     * Generate a card in the chat with a "Pay" button.
     * GM Only
     * @param {String} payRequest 
     */
    static generatePayCard(payRequest)
    {
      let parsedPayRequest = this.parsePayString(payRequest);
      //If the /pay command has a syntax error, we display an error message to the gm
      if(!parsedPayRequest)
      {
        let msg = `<h3><b>${game.i18n.localize("MARKET.PayRequest")}</b></h3>`;
        msg += `<p>${game.i18n.localize("MARKET.PayWrongCommand")}</p><p><i>${game.i18n.localize("MARKET.PayCommandExample")}</i></p>`;
        ChatMessage.create(WFRP_Utility.chatDataSetup(msg,"gmroll"));
      }
      else //generate a card with a summary and a pay button
      {
        let cardData = {
          payRequest:payRequest,
          QtGC:parsedPayRequest.gc,
          QtSS:parsedPayRequest.ss,
          QtBP:parsedPayRequest.bp
        };
        renderTemplate("systems/wfrp4e/templates/chat/market-pay.html", cardData).then(html => {
          let chatData = WFRP_Utility.chatDataSetup(html,"roll");
          ChatMessage.create(chatData);
        });
      }
    }
}